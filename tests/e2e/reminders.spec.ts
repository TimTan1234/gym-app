import { createECDH, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createServer, type Server } from "node:https";
import type { AddressInfo } from "node:net";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { signUpAndOnboard } from "./helpers";

// Headless Chromium has no push service, so permission and subscribing are stubbed in the page with a real-shaped
// subscription pointing at this fake push service (its certificate is trusted by the e2e server,
// see playwright.config.ts). Sending is real: VAPID-signed, encrypted, over HTTPS.
interface Delivery {
  path: string;
  headers: Record<string, string | string[] | undefined>;
  bytes: number;
}
let service: Server;
let base = "";
const deliveries: Delivery[] = [];

test.beforeAll(async () => {
  const fixture = (f: string) => readFileSync(join(__dirname, "fixtures", f));
  service = createServer({ key: fixture("push-service.key"), cert: fixture("push-service.crt") }, (req, res) => {
    let bytes = 0;
    req.on("data", (c: Buffer) => (bytes += c.length));
    req.on("end", () => {
      deliveries.push({ path: req.url ?? "", headers: req.headers, bytes });
      // A device that unsubscribed elsewhere: the push service says it's gone.
      res.writeHead(req.url?.startsWith("/gone/") ? 410 : 201).end();
    });
  });
  await new Promise<void>((resolve) => service.listen(0, "127.0.0.1", resolve));
  base = `https://127.0.0.1:${(service.address() as AddressInfo).port}`;
});
test.afterAll(() => service.close());

async function stubPush(context: BrowserContext, endpoint: string) {
  const p256dh = createECDH("prime256v1").generateKeys().toString("base64url");
  const auth = randomBytes(16).toString("base64url");
  await context.addInitScript(
    ({ endpoint, p256dh, auth }) => {
      const sub = {
        endpoint,
        expirationTime: null,
        toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh, auth } }),
        unsubscribe: async () => (localStorage.removeItem("fake-push"), true),
      };
      // Headless Chromium reports notifications as denied even when granted.
      Object.defineProperty(Notification, "permission", { get: () => "granted" });
      Notification.requestPermission = async () => "granted";
      PushManager.prototype.subscribe = async () => (localStorage.setItem("fake-push", "1"), sub as unknown as PushSubscription);
      PushManager.prototype.getSubscription = async () => (localStorage.getItem("fake-push") ? (sub as unknown as PushSubscription) : null);
    },
    { endpoint, p256dh, auth },
  );
}

const send = (page: Page, secret = "e2e-cron-secret") => page.request.post("/api/reminders/send", { headers: { Authorization: `Bearer ${secret}` } });

test("reminders: switched on per device, sent once a day when due, gone devices dropped", async ({ page, context, browser }) => {
  await stubPush(context, `${base}/live/${randomBytes(6).toString("hex")}`);
  const email = await signUpAndOnboard(page);

  // Onboarding logged today's weight; take it away so the weigh-in reminder is due.
  await page.goto("/progress");
  await page.getByRole("button", { name: /^Delete entry for/ }).first().click();
  await expect(page.getByRole("button", { name: /^Delete entry for/ })).toHaveCount(0);

  await page.goto("/settings");
  await page.getByRole("link", { name: "Reminders" }).click();
  await expect(page.getByRole("heading", { name: "Reminders" })).toBeVisible();
  const device = page.getByRole("switch", { name: "Notifications on this device" });
  await expect(device).toBeEnabled();
  await expect(page.getByText("Reminders won't reach this device.")).toBeVisible();
  await device.click();
  await expect(device).toBeChecked();
  await expect(page.getByText("Reminders won't reach this device.")).toHaveCount(0);

  // Due a minute ago, in the user's own time.
  const now = await page.evaluate(() => new Date(Date.now() - 60_000).toTimeString().slice(0, 5));
  await page.getByRole("switch", { name: "Morning weigh-in" }).click();
  await page.getByLabel("Morning weigh-in time").fill(now < "00:01" ? "00:00" : now);
  // The training-day reminder needs days and an active plan; on, but not due today.
  await page.getByRole("switch", { name: "Training days" }).click();
  await expect(page.getByText("Sent only while a training plan is active.")).toBeVisible();
  await expect(page.getByRole("group", { name: "Days" }).getByRole("button")).toHaveCount(7);
  await page.getByRole("button", { name: "Monday", exact: true }).click();
  await expect(page.getByRole("button", { name: "Monday", exact: true })).toHaveAttribute("aria-pressed", "true");

  // Settings are the user's, and survive a reload.
  await page.reload();
  await expect(page.getByRole("switch", { name: "Morning weigh-in" })).toBeChecked();
  await expect(page.getByLabel("Morning weigh-in time")).toHaveValue(now < "00:01" ? "00:00" : now);
  await expect(device).toBeChecked();

  // A second device of the same user, which its push service has since forgotten.
  const other = await browser.newContext({ baseURL: new URL(page.url()).origin });
  await stubPush(other, `${base}/gone/${randomBytes(6).toString("hex")}`);
  const phone = await other.newPage();
  await phone.goto("/sign-in");
  await phone.getByLabel("Email").fill(email);
  await phone.getByLabel("Password").fill("password123");
  await phone.getByRole("button", { name: "Sign in" }).click();
  await expect(phone).toHaveURL(/\/today/);
  await phone.goto("/settings/reminders");
  await phone.getByRole("switch", { name: "Notifications on this device" }).click();
  await expect(phone.getByRole("switch", { name: "Notifications on this device" })).toBeChecked();

  // Only the scheduler can send.
  expect((await page.request.post("/api/reminders/send")).status()).toBe(401);
  expect((await send(page, "wrong")).status()).toBe(401);

  // Other suites' users may have reminders due too; count only this user's devices.
  deliveries.length = 0;
  const first = await send(page);
  expect(first.status()).toBe(200);
  const mine = () => deliveries.filter((d) => d.path.includes("/live/") || d.path.includes("/gone/"));
  await expect.poll(() => mine().length).toBe(2);
  const live = mine().find((d) => d.path.startsWith("/live/"))!;
  expect(live.headers["content-encoding"]).toBe("aes128gcm");
  expect(String(live.headers.authorization)).toMatch(/^vapid t=.+, k=BKQjvUDB/);
  expect(live.bytes).toBeGreaterThan(0);
  expect(await first.json()).toMatchObject({ gone: 1 });

  // Not twice in a day.
  deliveries.length = 0;
  expect((await send(page)).status()).toBe(200);
  expect(mine()).toHaveLength(0);

  // Switching this device off unsubscribes it.
  await page.getByRole("switch", { name: "Notifications on this device" }).click();
  await expect(page.getByRole("switch", { name: "Notifications on this device" })).not.toBeChecked();
  await other.close();
});

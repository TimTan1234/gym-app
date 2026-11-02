import { expect, test } from "@playwright/test";
import { signUpAndOnboard } from "./helpers";

test("phone health data: link with a code, sync steps and sleep, see them used, unlink", async ({ page }) => {
  await signUpAndOnboard(page);
  // The account's time zone came from this browser, so its "today" is the phone's today too.
  const today = await page.evaluate(() => new Date().toLocaleDateString("en-CA"));
  const day = (n: number) => new Date(Date.parse(`${today}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

  await page.goto("/settings");
  await page.getByRole("button", { name: "Link an Android phone" }).click();
  const code = (await page.getByTestId("link-code").innerText()).trim();
  expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);

  // The phone trades the code for its own token; the code then stops working.
  const linked = await page.request.post("/api/device/link", { data: { code: code.toLowerCase(), name: "Pixel 8" } });
  expect(linked.status()).toBe(200);
  const { token } = (await linked.json()) as { token: string };
  expect((await page.request.post("/api/device/link", { data: { code, name: "Other phone" } })).status()).toBe(400);

  // A usual week of about 7,000 steps, then a busy day after a short night.
  const days = [-7, -6, -5, -4, -3, -2, -1].map((n) => ({ date: day(n), steps: 7000, sleepMinutes: 450 }));
  days.push({ date: today, steps: 12_000, sleepMinutes: 310 });
  const sync = (auth: string) => page.request.post("/api/device/sync", { headers: { Authorization: `Bearer ${auth}` }, data: { days } });
  const synced = await sync(token);
  expect(synced.status()).toBe(200);
  expect(await synced.json()).toEqual({ ok: true, saved: 8 });
  expect((await sync("not-a-token")).status()).toBe(401);

  await page.goto("/today");
  await expect(page.getByTestId("steps-sleep")).toContainText("12,000");
  await expect(page.getByTestId("short-sleep")).toContainText("5 h 10 min of sleep");
  // 5,000 steps over the usual day at 78 kg: about 120 kcal more today.
  await expect(page.getByTestId("step-bonus")).toHaveText("+120 kcal for 5,000 more steps than usual");

  await page.goto("/progress");
  await expect(page.getByRole("heading", { name: "Steps and sleep" })).toBeVisible();
  await expect(page.getByRole("figure").filter({ hasText: /^Sleep/ })).toBeVisible();

  // Unlinking stops the token at once.
  await page.goto("/settings");
  await expect(page.locator("#phone")).toContainText("Pixel 8");
  await expect(page.locator("#phone")).toContainText("Last synced");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Unlink Pixel 8" }).click();
  await expect(page.getByText("Unlinked Pixel 8")).toBeVisible();
  expect((await sync(token)).status()).toBe(401);
});

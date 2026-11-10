import { expect, test, type Page } from "@playwright/test";
import { signUpAndOnboard } from "./helpers";

const label = (page: Page, date: string) =>
  page.evaluate((d) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }), date);
const daysAgo = (page: Page, n: number) => page.evaluate((n) => new Date(Date.now() - n * 864e5).toLocaleDateString("en-CA"), n);

test("progress photos: add, compare, replace and delete; private to the user and gone with the account", async ({ page, browser }) => {
  page.on("dialog", (d) => void d.accept());
  await signUpAndOnboard(page);
  await page.goto("/progress");
  await page.getByRole("link", { name: "Photos" }).click();
  await expect(page.getByRole("heading", { name: "Progress photos" })).toBeVisible();
  await expect(page.getByText("No photos yet.")).toBeVisible();

  const [today, tenAgo, twentyAgo] = [await daysAgo(page, 0), await daysAgo(page, 10), await daysAgo(page, 20)];
  const [todayLabel, tenLabel, twentyLabel] = [await label(page, today), await label(page, tenAgo), await label(page, twentyAgo)];
  const input = page.getByTestId("progress-photo-input");
  const date = page.getByRole("textbox", { name: "Date", exact: true });
  const photo = (l: string) => page.getByRole("img", { name: `Progress photo, ${l}` });
  const thumb = (l: string) => page.getByRole("button", { name: l, exact: true });

  // One photo shows on its own, with that day's weigh-in from onboarding.
  await expect(page.getByRole("button", { name: "Add photo" })).toBeVisible();
  await input.setInputFiles("public/icons/icon-512.png");
  await expect(photo(todayLabel)).toBeVisible();
  await expect(page.locator("figure", { has: photo(todayLabel) }).getByText("78 kg")).toBeVisible();

  // With more, the oldest and newest compare side by side, with what changed between them.
  await date.fill(twentyAgo);
  await input.setInputFiles("public/icons/icon-192.png");
  await expect(photo(twentyLabel)).toBeVisible();
  await expect(page.getByText("20 days", { exact: true })).toBeVisible();
  await date.fill(tenAgo);
  await input.setInputFiles("public/icons/maskable-512.png");
  await expect(thumb(tenLabel)).toBeVisible();
  await expect(thumb(twentyLabel)).toHaveAttribute("aria-pressed", "true");
  await expect(thumb(tenLabel)).toHaveAttribute("aria-pressed", "false");
  await expect(thumb(todayLabel)).toHaveAttribute("aria-pressed", "true");

  // Tap a side, then a thumbnail to put that photo there.
  const left = page.getByRole("button", { name: `Progress photo, ${twentyLabel}` });
  await left.click();
  await expect(left).toHaveAttribute("aria-pressed", "true");
  await thumb(tenLabel).click();
  await expect(photo(tenLabel)).toBeVisible();
  await expect(photo(twentyLabel)).toHaveCount(0);
  await expect(page.getByText("10 days", { exact: true })).toBeVisible();

  // Served resized, as JPEG, to this user only and never kept by a cache.
  const src = (await photo(todayLabel).getAttribute("src"))!;
  const res = await page.request.get(src);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/jpeg");
  expect(res.headers()["cache-control"]).toBe("private, no-store");
  expect((await res.body()).length).toBeLessThan(300_000);
  const cached = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) for (const req of await (await caches.open(name)).keys()) urls.push(req.url);
    return urls;
  });
  expect(cached.filter((u) => u.includes("/api/progress-photos"))).toEqual([]);

  const stranger = await browser.newContext({ baseURL: new URL(page.url()).origin });
  expect((await stranger.request.get(src)).status()).toBe(401);
  const other = await stranger.newPage();
  await signUpAndOnboard(other, "Sam Lee");
  expect((await other.request.get(src)).status()).toBe(404);
  await stranger.close();

  // The server takes only JPEGs, up to today.
  const png = { name: "x.png", mimeType: "image/png", buffer: Buffer.from("89504e470d0a1a0a", "hex") };
  expect((await page.request.post("/api/progress-photos", { multipart: { date: today, photo: png } })).status()).toBe(400);
  const jpeg = { name: "x.jpg", mimeType: "image/jpeg", buffer: Buffer.from("ffd8ffe000104a464946", "hex") };
  expect((await page.request.post("/api/progress-photos", { multipart: { date: "2999-01-01", photo: jpeg } })).status()).toBe(400);
  // Not part of the data download.
  expect((await page.request.get("/api/export/photos")).status()).toBe(404);

  // A second photo for a date replaces the first (after a confirm).
  await date.fill(today);
  await input.setInputFiles("public/icons/icon-192.png");
  await expect.poll(async () => (await photo(todayLabel).getAttribute("src")) !== src).toBe(true);
  await expect(page.getByRole("button", { name: /^Delete the photo from/ })).toHaveCount(2);
  await expect(thumb(twentyLabel)).toBeVisible();

  // Delete from under the photo itself.
  await page.getByRole("button", { name: `Delete the photo from ${tenLabel}` }).click();
  await expect(thumb(tenLabel)).toHaveCount(0);
  await expect(photo(twentyLabel)).toBeVisible();

  // Photos go with the account.
  await page.goto("/settings/account");
  await page.getByRole("button", { name: "Delete account" }).click();
  const remove = page.locator("form").filter({ has: page.getByRole("button", { name: "Delete my account and data" }) });
  await remove.getByLabel("Password").fill("password123");
  await remove.getByRole("button", { name: "Delete my account and data" }).click();
  await expect(page).not.toHaveURL(/\/settings/);
});

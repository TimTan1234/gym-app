import { expect, test } from "@playwright/test";
import { signUpAndOnboard } from "./helpers";

/** Wednesday of last week, in the browser's (and so the profile's) timezone. */
function lastWednesday(today: string) {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) - 7 + 2);
  return d.toISOString().slice(0, 10);
}

test("weekly recap: empty week, then a card of last week to share as a PNG", async ({ page, browser }) => {
  await signUpAndOnboard(page);
  await page.goto("/progress");
  await page.getByRole("link", { name: "Last week" }).click();
  await expect(page.getByRole("heading", { name: "Weekly recap" })).toBeVisible();
  // Onboarding's weigh-in is this week: last week has nothing.
  await expect(page.getByText("Nothing logged last week.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Share" })).toHaveCount(0);
  expect((await page.request.get("/api/recap/image")).status()).toBe(404);

  // A meal on last week's Wednesday.
  const today = await page.evaluate(() => new Date().toLocaleDateString("en-CA"));
  const day = lastWednesday(today);
  await page.goto(`/nutrition/log?date=${day}`);
  await page.getByRole("radio", { name: "Lunch" }).click();
  await page.getByLabel("Meal description").fill("nasi lemak with fried chicken");
  await page.getByRole("button", { name: "Analyse with AI" }).click();
  await expect(page.getByText("Review & adjust")).toBeVisible();
  await page.getByRole("button", { name: "Save meal" }).click();
  await expect(page).toHaveURL(/\/nutrition\?date=/);

  await page.goto("/progress/recap");
  // No training last week: the card leads with the calories, and nothing else was logged.
  const card = page.getByRole("img", { name: /^\w{3} \d+ – \w{3} \d+\. 889 kcal a day\.$/ });
  await expect(card).toBeVisible();
  expect(await card.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(1080);

  // Headless Chromium can't share files, so the card downloads instead.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Share" }).click();
  expect((await download).suggestedFilename()).toMatch(/^gympal-\d{4}-\d{2}-\d{2}\.png$/);

  // The image itself: a PNG kept out of shared caches, for the signed-in user only.
  const res = await page.request.get("/api/recap/image");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/png");
  expect(res.headers()["cache-control"]).toBe("private, no-store");
  expect((await res.body()).subarray(1, 4).toString()).toBe("PNG");

  const stranger = await browser.newContext();
  expect((await stranger.request.get(`${new URL(page.url()).origin}/api/recap/image`)).status()).toBe(401);
  await stranger.close();
});

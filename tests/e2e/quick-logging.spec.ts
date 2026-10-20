import { expect, test } from "@playwright/test";
import { signUpAndOnboard } from "./helpers";

test("same as yesterday → recent meals → barcode lookup → saved foods", async ({ page }) => {
  await signUpAndOnboard(page);
  const yesterday = await page.evaluate(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return new Intl.DateTimeFormat("en-CA").format(d);
  });

  // Log yesterday's breakfast by hand
  await page.goto(`/nutrition/log?date=${yesterday}&type=BREAKFAST`);
  await page.getByRole("button", { name: "Add item manually" }).click();
  await page.getByLabel("Food name").fill("Overnight oats");
  await page.getByLabel("kcal").fill("350");
  await page.getByLabel("Protein").fill("20");
  await page.getByRole("button", { name: "Save meal" }).click();
  await expect(page).toHaveURL(/\/nutrition\?date=/);

  // Today: one tap repeats it
  await page.goto("/nutrition");
  const copy = page.getByRole("button", { name: /^Same as yesterday: Overnight oats/ });
  await expect(copy).toBeVisible();
  await copy.click();
  await expect(page.getByText("Meal copied")).toBeVisible();
  await expect(page.getByRole("button", { name: /Overnight oats/ })).toBeVisible();
  await expect(copy).toHaveCount(0);

  // Recent meals load into the draft for editing
  await page.goto("/nutrition/log?type=SNACK");
  await page.getByRole("button", { name: "Add Overnight oats" }).click();
  await expect(page.getByLabel("Food name")).toHaveValue("Overnight oats");
  await expect(page.getByLabel("Meal name")).toHaveValue("Overnight oats");

  // Barcode: unknown code, then a known one (fixture under AI_MOCK=1)
  await page.getByRole("button", { name: "Scan a barcode" }).click();
  const scanner = page.getByRole("dialog", { name: "Scan a barcode" });
  await scanner.getByLabel("Barcode number").fill("0000000000017");
  await scanner.getByRole("button", { name: "Look up" }).click();
  await expect(scanner.getByRole("alert")).toContainText("isn't in the Open Food Facts database");
  await scanner.getByLabel("Barcode number").fill("9556001234567");
  await scanner.getByRole("button", { name: "Look up" }).click();
  await expect(scanner).toBeHidden();
  const scanned = page.getByTestId("draft-item").filter({ has: page.getByRole("button", { name: "Remove Chocolate Malt Drink (Test Brand)" }) });
  await expect(scanned.getByLabel("Grams")).toHaveValue("30");
  await expect(scanned.getByLabel("kcal")).toHaveValue("123");
  await expect(page.getByTestId("draft-total-kcal")).toHaveText("473");
  await page.getByRole("button", { name: "Save meal" }).click();
  await expect(page).toHaveURL(/\/nutrition$/);

  // Star the scanned item, then remove it from saved foods
  // The snack (logged last) holds the scanned item.
  await page.getByRole("button", { name: /^Overnight oats/ }).last().click();
  await page.getByRole("button", { name: "Save Chocolate Malt Drink (Test Brand) to favourites" }).click();
  await expect(page.getByText(/Saved “Chocolate Malt Drink/)).toBeVisible();
  await page.goto("/nutrition/log");
  await expect(page.getByRole("button", { name: /^Chocolate Malt Drink \(Test Brand\) 123 kcal/ })).toBeVisible();
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("button", { name: "Remove Chocolate Malt Drink (Test Brand) from saved foods" }).click();
  await expect(page.getByRole("button", { name: /from saved foods/ })).toHaveCount(0);
});

test("plate math for barbell lifts, check-in needs data", async ({ page }) => {
  await signUpAndOnboard(page);

  await page.goto("/train");
  await page.getByRole("button", { name: "Empty workout" }).first().click();
  await expect(page).toHaveURL(/\/train\/workout\//);
  await page.getByRole("button", { name: "Add exercise" }).click();
  await page.getByLabel("Search exercises").fill("back squat");
  await page.getByRole("button", { name: /^Barbell Back Squat/ }).click();
  const block = page.getByTestId("exercise-block").filter({ hasText: "Barbell Back Squat" });
  await block.getByLabel("kg").fill("102.5");
  await expect(block.getByTestId("plate-load")).toContainText("Each side: 25 + 15 + 1.25");
  await block.getByRole("button", { name: "20 kg bar" }).click();
  await expect(block.getByTestId("plate-load")).toContainText("Each side: 25 + 15 + 2.5 + 1.25");
  await expect(block.getByRole("button", { name: "15 kg bar" })).toBeVisible();
  await block.getByLabel("kg").fill("61");
  await expect(block.getByTestId("plate-load")).toContainText("1 short");

  await page.getByRole("button", { name: "Add exercise" }).click();
  await page.getByLabel("Search exercises").fill("dumbbell curl");
  await page.getByRole("button", { name: /^Dumbbell Curl/ }).first().click();
  const curl = page.getByTestId("exercise-block").filter({ has: page.getByRole("heading", { name: "Dumbbell Curl", exact: true }) });
  await curl.getByLabel("kg").fill("12");
  await expect(curl.getByTestId("plate-load")).toHaveCount(0);

  // A new account has no history, so the check-in explains what it needs.
  await page.goto("/progress");
  const checkin = page.getByTestId("weekly-checkin");
  await expect(checkin.getByRole("heading", { name: "Not enough data yet" })).toBeVisible();
  await expect(checkin).toContainText("10 more fully logged days");
  await checkin.getByRole("link", { name: "Ask the coach" }).click();
  await expect(page).toHaveURL(/\/coach\?q=/);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("chat-log")).toContainText("Weekly check-in: not enough data yet");
});

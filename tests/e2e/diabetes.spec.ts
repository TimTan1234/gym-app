import { expect, test, type Page } from "@playwright/test";
import { signUpAndOnboard } from "./helpers";

async function enableDiabetesMode(page: Page, { meds = false } = {}) {
  await page.goto("/settings");
  const card = page.locator("#diabetes");
  await card.getByRole("switch", { name: "Use diabetes mode" }).click();
  await expect(card.getByText("It is not medical advice")).toBeVisible();
  if (meds) await card.getByLabel(/I take insulin or a sulfonylurea/).check();
  await card.getByRole("button", { name: "Save diabetes settings" }).click();
  await expect(page.getByText("Diabetes settings saved")).toBeVisible();
}

async function logReading(page: Page, value: string, context: string) {
  const before = await page.getByTestId("glucose-reading").count();
  const form = page.getByRole("form", { name: "Log a reading" });
  await form.getByLabel(/^Reading/).fill(value);
  await form.getByRole("radio", { name: context }).click();
  await form.getByRole("button", { name: "Save reading" }).click();
  await expect(page.getByTestId("glucose-reading")).toHaveCount(before + 1);
}

test("diabetes mode: carb cap, glucose log, low-glucose steps, units, carb floor", async ({ page }) => {
  await signUpAndOnboard(page);
  await page.goto("/settings");
  const carbsBefore = Number(await page.getByLabel("Carbs (g)").inputValue());

  await enableDiabetesMode(page);
  // Automatic targets now keep carbs within the guideline's per-meal budget
  await expect(page.getByLabel("Carbs (g)")).not.toHaveValue(String(carbsBefore));
  const carbsAfter = Number(await page.getByLabel("Carbs (g)").inputValue());
  expect(carbsAfter).toBeLessThan(carbsBefore);
  expect(carbsAfter).toBeGreaterThanOrEqual(130);

  // Today shows the glucose section
  await page.goto("/today");
  await expect(page.getByText("No reading yet today.")).toBeVisible();

  // Log readings
  await page.goto("/glucose");
  await expect(page.getByText("Target 4.4–7 mmol/L fasting and before meals, up to 8.5 after meals")).toBeVisible();
  await logReading(page, "6.2", "Fasting");
  await expect(page.getByTestId("glucose-reading").first()).toContainText("In target");
  await expect(page.getByTestId("glucose-summary")).toHaveText("1 of 1 readings in target");

  await logReading(page, "3.4", "Before a meal");
  const hypo = page.getByTestId("hypo-card").first();
  await expect(hypo).toContainText("Low glucose: treat it now");
  await expect(hypo).toContainText("3 teaspoons of sugar in water");
  await expect(hypo).toContainText("call 999");
  await expect(page.getByTestId("glucose-summary")).toHaveText("1 of 2 readings in target");
  await expect(page.getByText("1 low")).toBeVisible();
  // The latest low keeps its steps on the page after a reload
  await page.reload();
  await expect(page.getByTestId("hypo-card")).toBeVisible();

  // After-meal reading under the 8.5 post-prandial limit is in target; a fasting 7.4 is not
  await logReading(page, "7.4", "Bedtime");
  await expect(page.getByTestId("glucose-reading").first()).toContainText("In target");

  // Switch to mg/dL: the stored readings are shown converted
  await page.goto("/settings");
  await page.locator("#diabetes").getByRole("radio", { name: "mg/dL" }).click();
  await page.locator("#diabetes").getByRole("button", { name: "Save diabetes settings" }).click();
  await expect(page.getByText("Diabetes settings saved")).toBeVisible();
  await page.goto("/glucose");
  await expect(page.getByText("Target 79–126 mg/dL fasting and before meals, up to 153 after meals")).toBeVisible();
  await expect(page.getByTestId("glucose-reading").filter({ hasText: "Before a meal" })).toContainText("61");

  // Delete a reading
  await page.getByRole("button", { name: /^Delete reading taken at/ }).first().click();
  await expect(page.getByText("Reading deleted")).toBeVisible();
  await expect(page.getByTestId("glucose-reading")).toHaveCount(2);

  // Manual targets can't go under 130 g of carbs in diabetes mode
  await page.goto("/settings");
  await page.getByRole("button", { name: "Custom" }).click();
  await page.getByLabel("Carbs (g)").fill("100");
  await page.getByRole("button", { name: "Save targets" }).click();
  await expect(page.getByText("can't be set below 130 g a day")).toBeVisible();
});

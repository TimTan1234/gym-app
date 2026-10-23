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
  const carbsBefore = Number(await page.getByLabel("Carbs", { exact: true }).inputValue());

  await enableDiabetesMode(page);
  // Automatic targets now keep carbs within the guideline's per-meal budget
  await expect(page.getByLabel("Carbs", { exact: true })).not.toHaveValue(String(carbsBefore));
  const carbsAfter = Number(await page.getByLabel("Carbs", { exact: true }).inputValue());
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
  await page.getByLabel("Carbs", { exact: true }).fill("100");
  await page.getByRole("button", { name: "Save targets" }).click();
  await expect(page.getByText("can't be set below 130 g a day")).toBeVisible();
});

test("diabetes mode: meal time, after-meal reminder, linked readings and meal responses", async ({ page }) => {
  await signUpAndOnboard(page);
  await enableDiabetesMode(page);

  // Eaten two hours ago (needs today to have started at least ~2 h ago)
  const { minutes, time } = await page.evaluate(() => {
    const d = new Date(Date.now() - 120 * 60000);
    const now = new Date();
    return { minutes: now.getHours() * 60 + now.getMinutes(), time: d.toTimeString().slice(0, 5) };
  });
  test.skip(minutes < 130, "too early in the day for a meal two hours ago");

  await page.goto("/nutrition/log?type=LUNCH");
  await page.getByLabel("Meal description").fill("nasi lemak with fried chicken");
  await page.getByRole("button", { name: "Analyse with AI" }).click();
  await expect(page.getByText("Review & adjust")).toBeVisible();
  // Set after the page is interactive, so hydration can't reset it
  await page.getByLabel("Time eaten").fill(time);
  await expect(page.getByLabel("Time eaten")).toHaveValue(time);
  await page.getByRole("button", { name: "Save meal" }).click();
  await expect(page).toHaveURL(/\/nutrition$/);

  // Food page asks for the 2-hour check, and the link prefills the form
  const prompt = page.getByTestId("after-meal-prompt");
  await expect(prompt).toContainText(`Check your glucose about 2 hours after Nasi lemak with fried chicken (eaten at ${time})`);
  await prompt.getByRole("link", { name: "Log after-meal reading" }).click();
  await expect(page).toHaveURL(/context=AFTER_MEAL/);
  const form = page.getByRole("form", { name: "Log a reading" });
  await expect(form.getByRole("radio", { name: "After a meal" })).toHaveAttribute("aria-checked", "true");
  await expect(form.getByLabel("Which meal?")).toHaveValue(/.+/);
  await form.getByLabel(/^Reading/).fill("9.2");
  await form.getByRole("button", { name: "Save reading" }).click();
  const reading = page.getByTestId("glucose-reading").first();
  await expect(reading).toContainText("After Nasi lemak with fried chicken");
  await expect(reading).toContainText("Above target");
  await expect(page.getByTestId("meal-responses")).toContainText("Nasi lemak with fried chicken");
  await expect(page.getByTestId("meal-responses")).toContainText("9.2 mmol/L after");

  // The meal card shows it; the reminder is gone
  await page.goto("/nutrition");
  await expect(page.getByTestId("after-meal-prompt")).toHaveCount(0);
  await expect(page.getByTestId("meal-glucose")).toContainText("9.2 mmol/L");
  await expect(page.getByTestId("meal-glucose")).toContainText("Above target");

  // Editing keeps the meal's time
  await page.getByRole("button", { name: /Nasi lemak/ }).first().click();
  await page.getByRole("link", { name: /^Edit Nasi/ }).click();
  await expect(page.getByLabel("Time eaten")).toHaveValue(time);

  // A reading too soon after a meal isn't judged against the after-meal target
  await page.goto("/nutrition/log?type=SNACK");
  await page.getByRole("button", { name: "Add item manually" }).click();
  await page.getByTestId("draft-item").last().getByLabel("Food name").fill("Kuih lapis");
  await page.getByTestId("draft-item").last().getByLabel("Carbs").fill("30");
  await page.getByRole("button", { name: "Save meal" }).click();
  await expect(page).toHaveURL(/\/nutrition$/);
  await page.goto("/glucose");
  await form.getByRole("radio", { name: "After a meal" }).click();
  const kuih = await form.getByLabel("Which meal?").locator("option", { hasText: "Kuih lapis" }).getAttribute("value");
  await form.getByLabel("Which meal?").selectOption(kuih!);
  await form.getByLabel(/^Reading/).fill("10.5");
  await form.getByRole("button", { name: "Save reading" }).click();
  await expect(page.getByTestId("glucose-reading").first()).toContainText("Too soon after eating to compare");
});

test("diabetes mode: carb budget per meal and GI bands", async ({ page }) => {
  await signUpAndOnboard(page);
  await enableDiabetesMode(page);

  await page.goto("/nutrition/log?type=LUNCH");
  await page.getByLabel("Meal description").fill("nasi lemak with fried chicken");
  await page.getByRole("button", { name: "Analyse with AI" }).click();
  await expect(page.getByText("Review & adjust")).toBeVisible();
  // The rice is high GI (CPG Appendix 4: over 70); the mock meal has 72 g of carbs
  const rice = page.getByTestId("draft-item").first();
  await expect(rice.getByText("High GI")).toBeVisible();
  await expect(page.getByTestId("carb-budget")).toHaveText(/^72 g carbs, budget \d+–\d+ g$/);
  await page.getByRole("button", { name: "Save meal" }).click();
  await expect(page).toHaveURL(/\/nutrition$/);

  await expect(page.getByTestId("carb-budget")).toHaveText(/^72 g carbs, budget \d+–\d+ g$/);
  const meal = page.getByRole("button", { name: /Nasi lemak/ });
  await expect(meal).toContainText("100% of carbs from high-GI food");
  await meal.click();
  await expect(page.getByText("High GI")).toBeVisible();

  // A big snack goes over the 15–30 g snack budget
  await page.goto("/nutrition/log?type=SNACK");
  await page.getByRole("button", { name: "Add item manually" }).click();
  const k = page.getByTestId("draft-item").last();
  await k.getByLabel("Food name").fill("Kuih lapis");
  await k.getByLabel("Carbs").fill("45");
  await expect(page.getByTestId("carb-budget")).toHaveText("45 g carbs, 15 g over the 30 g budget");
});

test("diabetes mode: pre-training glucose check and the coach reads glucose", async ({ page }) => {
  await signUpAndOnboard(page);
  await enableDiabetesMode(page, { meds: true });

  // On a sulfonylurea with no recent reading: check first
  await page.goto("/train");
  await expect(page.getByTestId("pre-exercise")).toContainText("Check your glucose before you train");
  await page.getByTestId("pre-exercise").getByRole("link", { name: "Log a reading" }).click();
  await expect(page.getByRole("form", { name: "Log a reading" }).getByRole("radio", { name: "Before exercise" })).toHaveAttribute("aria-checked", "true");
  await logReading(page, "5.2", "Before exercise");

  // Under 5.6 (CPG Appendix 5): eat first
  await page.goto("/train");
  await expect(page.getByTestId("pre-exercise")).toContainText("Your glucose is 5.2 mmol/L. Have some extra carbs before you train");

  // A low: treat it first
  await page.goto("/glucose");
  await logReading(page, "3.5", "Before exercise");
  await page.goto("/today");
  await expect(page.getByTestId("pre-exercise")).toContainText("Your glucose is low (3.5 mmol/L)");
  await expect(page.getByTestId("hypo-card")).toBeVisible();

  // Fine to train after eating
  await page.goto("/glucose");
  await logReading(page, "6.4", "Before exercise");
  await page.goto("/train");
  await expect(page.getByTestId("pre-exercise")).toContainText("Last reading 6.4 mmol/L");

  // The coach can see the log
  await page.goto("/coach");
  await page.getByLabel("Message the coach").fill("How is my glucose this week?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Glucose: 2 of 3 readings in target (mmol/L).")).toBeVisible();
});

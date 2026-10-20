import { expect, test } from "@playwright/test";
import { signUpAndOnboard } from "./helpers";

test("generate AI plan → activate → start planned workout", async ({ page }) => {
  await signUpAndOnboard(page);

  await page.getByRole("link", { name: "Create a plan" }).click();
  await expect(page).toHaveURL(/\/train\/plans\/new/);
  await page.getByRole("button", { name: "Build muscle" }).click();
  await page.getByRole("button", { name: "Generate plan" }).click();

  // Mock plan: 4 days, editable
  await expect(page.getByTestId("plan-day")).toHaveCount(4);
  await expect(page.getByLabel("Day 1 name")).toHaveValue("Upper A");
  await page.getByRole("button", { name: "Save & activate" }).click();

  await expect(page).toHaveURL(/\/train\/plans$/);
  await expect(page.getByText("Active", { exact: true })).toBeVisible();

  // Today offers the first plan day
  await page.getByRole("link", { name: "Today" }).click();
  await page.getByRole("button", { name: "Start Upper A" }).click();
  await expect(page).toHaveURL(/\/train\/workout\//);
  await expect(page.getByTestId("exercise-block")).toHaveCount(5);
  await expect(page.getByText("4 sets of 5–8, RPE 8")).toBeVisible();

  const bench = page.getByTestId("exercise-block").filter({ hasText: "Barbell Bench Press" });
  await bench.getByLabel("kg").fill("80");
  await bench.getByLabel("Reps").fill("6");
  await bench.getByRole("button", { name: /Log set/ }).click();
  await expect(bench.getByRole("img", { name: "1 of 4 sets done" })).toBeVisible();

  await page.getByRole("button", { name: "Finish" }).click();
  await page.getByRole("button", { name: "Save workout" }).click();
  await expect(page).toHaveURL(/\/train\/history\//);
  await expect(page.getByRole("heading", { name: "Upper A" })).toBeVisible();

  // Exercise detail and progress dashboard render with workout data
  await page.getByRole("link", { name: "Barbell Bench Press" }).click();
  await expect(page.getByRole("heading", { name: "Barbell Bench Press" })).toBeVisible();
  await expect(page.getByText(/^Estimated 1RM/)).toBeVisible();
  await page.goto("/progress");
  await expect(page.getByRole("figure").filter({ hasText: "Working sets per muscle" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Barbell Bench Press/ })).toBeVisible();

  // Next up is now the second day
  await page.getByRole("link", { name: "Train" }).click();
  await expect(page.getByRole("button", { name: "Start Lower A" })).toBeVisible();
});

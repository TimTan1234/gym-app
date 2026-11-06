import { expect, test } from "@playwright/test";
import { signUpAndOnboard } from "./helpers";

test("food: pick any day from the calendar, and log a meal on it", async ({ page }) => {
  await signUpAndOnboard(page);
  await page.goto("/nutrition");
  const day = new Date(Date.now() - 9 * 864e5).toISOString().slice(0, 10);
  await page.getByLabel(/^Choose a date/).fill(day);
  await expect(page).toHaveURL(new RegExp(`/nutrition\\?date=${day}$`));
  // The picker now shows that day, and logging from here saves to it.
  await expect(page.getByLabel(/^Choose a date/)).toHaveValue(day);
  // A past day is over: what's left is "under your target", not "left today".
  await expect(page.getByText("kcal under your target")).toBeVisible();
  await expect(page.getByText("kcal left today")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Log meal" })).toHaveAttribute("href", `/nutrition/log?date=${day}`);
});

test("workout: remove an exercise, and it stays removed until logged again", async ({ page }) => {
  await signUpAndOnboard(page);
  await page.goto("/train/plans/new");
  await page.getByRole("button", { name: "Build muscle" }).click();
  await page.getByRole("button", { name: "Generate plan" }).click();
  await page.getByRole("button", { name: "Save & activate" }).click();
  await expect(page).toHaveURL(/\/train\/plans$/);

  await page.goto("/train");
  await page.getByRole("button", { name: "Start Upper A" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Start with these sets" }).click();
  await expect(page).toHaveURL(/\/train\/workout\//);
  const blocks = page.getByTestId("exercise-block");
  await expect(blocks).toHaveCount(5);

  const bench = blocks.filter({ hasText: "Barbell Bench Press" });
  await bench.getByLabel("kg").fill("60");
  await bench.getByLabel("Reps").fill("8");
  await bench.getByRole("button", { name: /^Log set for/ }).click();
  await expect(page.getByText(/1 working set$/)).toBeVisible();

  // A logged set means a confirm first; its sets go with it.
  page.once("dialog", (d) => d.accept());
  await bench.getByRole("button", { name: "Remove exercise Barbell Bench Press" }).click();
  await expect(blocks).toHaveCount(4);
  await expect(page.getByText(/0 working sets$/)).toBeVisible();

  // Reopening the workout doesn't bring the planned exercise back.
  await page.reload();
  await expect(blocks).toHaveCount(4);
  await expect(blocks.filter({ hasText: "Barbell Bench Press" })).toHaveCount(0);

  // Adding it back and logging a set returns it with its planned target.
  await page.getByRole("button", { name: "Add exercise" }).click();
  await page.getByLabel("Search exercises").fill("barbell bench");
  await page.getByRole("button", { name: /^Barbell Bench Press/ }).click();
  const again = blocks.filter({ hasText: "Barbell Bench Press" });
  await again.getByLabel("kg").fill("60");
  await again.getByLabel("Reps").fill("8");
  await again.getByRole("button", { name: /^Log set for/ }).click();
  await expect(page.getByText(/1 working set$/)).toBeVisible();
  await page.reload();
  await expect(blocks).toHaveCount(5);
  await expect(blocks.filter({ hasText: "Barbell Bench Press" })).toContainText("4 sets of 5–8");
});

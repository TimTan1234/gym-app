import { expect, test, type Locator, type Page } from "@playwright/test";
import { signUpAndOnboard } from "./helpers";

async function addExercise(page: Page, search: string, name: string) {
  await page.getByRole("button", { name: "Add exercise" }).click();
  await page.getByLabel("Search exercises").fill(search);
  await page.getByRole("button", { name: new RegExp(`^${name}`) }).click();
  return page.getByTestId("exercise-block").filter({ has: page.getByRole("heading", { name, exact: true }) });
}

// A saved set's row is one button, "Edit set N"; delete lives in its editor.
const savedSets = (block: Locator) => block.getByRole("button", { name: /^Edit set/ });

async function logLift(block: Locator, kg: string, reps: string) {
  const before = await savedSets(block).count();
  await block.getByLabel("kg").last().fill(kg);
  await block.getByLabel("Reps").last().fill(reps);
  await block.getByRole("button", { name: /^Log set for/ }).click();
  await expect(savedSets(block)).toHaveCount(before + 1);
}

const row = (scope: Locator, text: string) => scope.getByRole("row").filter({ hasText: text });

test("edit and delete sets, in the workout and after it, with records kept true; cardio as time and distance", async ({ page }) => {
  await signUpAndOnboard(page);
  await page.goto("/train");
  await page.getByRole("button", { name: "Empty workout" }).first().click();
  await expect(page).toHaveURL(/\/train\/workout\//);

  const bench = await addExercise(page, "barbell bench", "Barbell Bench Press");
  await logLift(bench, "100", "5");
  await logLift(bench, "200", "5"); // a typo
  await logLift(bench, "105", "5");

  // No icons on saved rows: tapping one opens its editor. 100 × 5 becomes 100 × 6.
  await expect(bench.getByRole("button", { name: /^Delete set/ })).toHaveCount(0);
  await row(bench, "100").click();
  // The set's inputs come before the entry row's.
  await bench.getByLabel("Reps").first().fill("6");
  await bench.getByRole("button", { name: "Save set 1" }).click();
  await expect(bench.getByRole("button", { name: "Save set 1" })).toHaveCount(0);
  await expect(row(bench, "100").getByRole("cell").nth(2)).toHaveText("6");

  // Records show on the rows that hold them. Delete the typo from its editor: 105 now holds the
  // max-weight record it had been denied.
  await expect(row(bench, "200").getByLabel(/^Record: .*Heaviest weight/)).toBeVisible();
  await expect(row(bench, "105").getByLabel(/^Record/)).toHaveCount(0);
  await bench.getByRole("button", { name: "Edit set 2" }).click();
  await bench.getByRole("button", { name: "Delete set 2" }).click();
  await expect(savedSets(bench)).toHaveCount(2);
  await expect(row(bench, "105").getByLabel(/^Record: .*Heaviest weight/)).toBeVisible();

  // Cardio: minutes and kilometres instead of weight and reps.
  const run = await addExercise(page, "treadmill", "Treadmill Run");
  await expect(run.getByRole("columnheader", { name: "min" })).toBeVisible();
  await run.getByLabel("min").fill("25");
  await run.getByLabel("km").fill("5");
  await run.getByRole("button", { name: "Log set for Treadmill Run" }).click();
  await expect(savedSets(run)).toHaveCount(1);
  await expect(row(run, "25").getByRole("cell").nth(2)).toHaveText("5");

  await page.getByRole("button", { name: "Finish" }).click();
  await page.getByRole("button", { name: "Save workout" }).click();
  await expect(page).toHaveURL(/\/train\/history\//);

  // Cardio adds nothing to the volume: 100×6 + 105×5 = 1,125 kg.
  await expect(page.locator("dl > div", { hasText: "kg lifted" }).locator("dd")).toHaveText("1,125");
  const benchTable = page.locator("section", { has: page.getByRole("link", { name: "Barbell Bench Press" }) });
  await expect(row(benchTable, "105").getByLabel(/^Record: .*Heaviest weight/)).toBeVisible();
  const runTable = page.locator("section", { has: page.getByRole("link", { name: "Treadmill Run" }) });
  await expect(runTable.getByRole("columnheader", { name: "km" })).toBeVisible();
  await expect(runTable.getByLabel(/^Record/)).toHaveCount(0);

  // Edit a finished workout's set: 105 → 110, and the record moves with it.
  await row(benchTable, "105").click();
  await benchTable.getByLabel("kg").fill("110");
  await benchTable.getByRole("button", { name: "Save set 2" }).click();
  await expect(row(benchTable, "110").getByLabel(/^Record: .*Heaviest weight/)).toBeVisible();
  await expect(page.locator("dl > div", { hasText: "kg lifted" }).locator("dd")).toHaveText("1,150");

  // Delete a single set of a finished workout.
  await benchTable.getByRole("button", { name: "Edit set 1" }).click();
  await benchTable.getByRole("button", { name: "Delete set 1" }).click();
  await expect(savedSets(benchTable)).toHaveCount(1);
  await expect(page.locator("dl > div", { hasText: "kg lifted" }).locator("dd")).toHaveText("550");

  // The exercise page shows the run as time and distance.
  await runTable.getByRole("link", { name: "Treadmill Run" }).click();
  await expect(page.getByText("25 min / 5 km")).toBeVisible();

  // A workout that isn't there gets the app's own not-found page, inside the navigation.
  await page.goto("/train/history/no-such-workout");
  await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to Today" })).toBeVisible();
});

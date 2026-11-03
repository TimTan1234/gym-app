import { expect, test, type Page } from "@playwright/test";
import { signUpAndOnboard } from "./helpers";

/** A date `days` ago in the browser's timezone, which onboarding saved as the profile's. */
async function daysAgo(page: Page, days: number) {
  return page.evaluate((n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toLocaleDateString("en-CA");
  }, days);
}

async function enableCycleTracking(page: Page) {
  await page.goto("/settings");
  const card = page.locator("#cycle");
  await card.getByRole("switch", { name: "Cycle tracking" }).click();
  await card.getByRole("button", { name: "Save cycle settings" }).click();
  await expect(page.getByText("Cycle settings saved")).toBeVisible();
}

/** Pick a file through the Luna import button (it only opens the chooser once the page is interactive). */
async function chooseLunaFile(page: Page, file: string) {
  await expect(async () => {
    const chooser = page.waitForEvent("filechooser", { timeout: 2_000 });
    await page.locator("#cycle").getByRole("button", { name: "Choose Luna file" }).click();
    await (await chooser).setFiles(file);
  }).toPass();
}

async function saveDay(page: Page) {
  await page.getByRole("form", { name: "Log cycle day" }).getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/cycle$/);
}

test("cycle tracking: log periods, see the phase and predictions, end a period, ask the coach", async ({ page }) => {
  await signUpAndOnboard(page, "Mei Lin", { sex: "FEMALE" });
  await enableCycleTracking(page);

  await page.goto("/today");
  await expect(page.getByText("Log the first day of your last period to see your cycle here.")).toBeVisible();

  // The period before last, with flow and a severe symptom
  const d30 = await daysAgo(page, 30);
  await page.goto(`/cycle/log?date=${d30}&start=1`);
  const form = page.getByRole("form", { name: "Log cycle day" });
  await expect(form.getByRole("switch", { name: "Period started on this day" })).toHaveAttribute("aria-checked", "true");
  await form.getByRole("radiogroup", { name: "Flow" }).getByRole("radio", { name: "Heavy" }).click();
  await form.getByRole("button", { name: "Cramps" }).click();
  await form.getByRole("radiogroup", { name: "How bad: Cramps" }).getByRole("radio", { name: "Severe" }).click();
  await saveDay(page);

  // The current period, started two days ago
  const d2 = await daysAgo(page, 2);
  await page.goto(`/cycle/log?date=${d2}`);
  await page.getByRole("switch", { name: "Period started on this day" }).click();
  await saveDay(page);

  await expect(page.getByTestId("cycle-countdown")).toHaveText("Period day 3");
  await page.goto(`/cycle?month=${d2.slice(0, 7)}`);
  await expect(page.locator(`a[href="/cycle/log?date=${d2}"]`)).toHaveAttribute("aria-label", /Period/);

  await page.goto("/today");
  await expect(page.getByText("Day 3", { exact: true })).toBeVisible();
  await expect(page.getByTestId("cycle-countdown")).toHaveText("Period day 3");

  // An end needs a start in the 14 days before it
  // (12 days ago is 18 days after the earlier start and before the current one).
  await page.goto(`/cycle/log?date=${await daysAgo(page, 12)}`);
  await form.getByRole("switch", { name: "Period ended on this day" }).click();
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await expect(form.getByRole("alert")).toContainText("Log this period's first day before its last");

  // End the current period today
  await page.goto(`/cycle/log?date=${await daysAgo(page, 0)}`);
  await page.getByRole("switch", { name: "Period ended on this day" }).click();
  await saveDay(page);

  await page.goto("/cycle/history");
  const periods = page.getByTestId("cycle-period");
  await expect(periods).toHaveCount(2);
  await expect(periods.first()).toContainText("3 days");
  await expect(periods.nth(1)).toContainText("cycle 28 days");
  await expect(periods.nth(1)).toContainText("Cramps");

  await page.goto("/coach");
  await page.getByLabel("Message the coach").fill("How does my cycle look?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(/Cycle: today is day 3 \(menstrual phase\)/)).toBeVisible();

  // Deleting a day clears its period start too
  await page.goto(`/cycle/log?date=${d30}`);
  await page.getByRole("button", { name: "Delete day" }).click();
  await page.getByRole("button", { name: "Tap again to delete" }).click();
  await expect(page).toHaveURL(/\/cycle$/);
  await page.goto("/cycle/history");
  await expect(page.getByTestId("cycle-period")).toHaveCount(1);
});

test("cycle tracking: import a Luna backup, and a second import adds nothing", async ({ page }) => {
  await signUpAndOnboard(page, "Mei Lin", { sex: "FEMALE" });
  await page.goto("/settings");
  const card = page.locator("#cycle");
  const file = "tests/fixtures/luna-backup.json";

  await chooseLunaFile(page, file);
  await expect(card.getByTestId("luna-preview")).toContainText("Adds 3 periods and 4 days. 2 with an impossible date (skipped).");
  await card.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText("Imported 3 periods and 4 days.")).toBeVisible();

  // Importing turned tracking on
  await page.goto("/cycle/history");
  await expect(page.getByTestId("cycle-period")).toHaveCount(3);
  await expect(page.getByText("Back pain").first()).toBeVisible();

  await page.goto("/settings");
  await chooseLunaFile(page, file);
  await expect(page.getByText("Everything in this file is already in GymPal.")).toBeVisible();
});

test("cycle tracking is not offered to men", async ({ page }) => {
  await signUpAndOnboard(page);
  await page.goto("/settings");
  await expect(page.locator("#diabetes")).toBeVisible();
  await expect(page.locator("#cycle")).toHaveCount(0);
  await page.goto("/cycle");
  await expect(page.getByText("Cycle tracking is off")).toBeVisible();
});

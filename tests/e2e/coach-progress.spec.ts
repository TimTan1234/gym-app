import { expect, test } from "@playwright/test";
import { signUpAndOnboard } from "./helpers";

test("coach proposes targets → apply → settings reflects it; progress renders", async ({ page }) => {
  await signUpAndOnboard(page, "Sam Lee");

  // Read the computed targets from settings
  await page.goto("/settings/targets");
  const kcalInput = page.getByLabel("kcal");
  const originalKcal = Number(await kcalInput.inputValue());
  expect(originalKcal).toBeGreaterThan(1200);

  // Ask the (mock) coach
  await page.getByRole("link", { name: "Coach" }).click();
  await page.getByLabel("Message the coach").fill("Should I change my calorie targets?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(`${originalKcal} kcal`)).toBeVisible();
  const proposal = page.getByTestId("proposal");
  await expect(proposal).toBeVisible();
  await expect(proposal.locator("dd").first()).toHaveText((originalKcal - 100).toLocaleString("en-US"));
  await proposal.getByRole("button", { name: "Apply" }).click();
  await expect(proposal.getByRole("button", { name: "Applied" })).toBeVisible();

  // Thread persisted
  await expect(page).toHaveURL(/\/coach\?thread=/);

  await page.goto("/settings/targets");
  await expect(page.getByLabel("kcal")).toHaveValue(String(originalKcal - 100));
  await expect(page.getByRole("button", { name: "Custom" })).toHaveAttribute("aria-pressed", "true");

  // Log two weights and see the trend
  await page.goto("/progress");
  await expect(page.getByRole("heading", { name: "Progress" })).toBeVisible();
  const log = page.locator("form", { has: page.getByLabel("Body fat %") });
  await log.getByLabel("Date").fill(new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10));
  await log.getByLabel("Weight (kg)").fill("79");
  await log.getByLabel("Body fat %").fill("21.4");
  await log.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("figure").filter({ hasText: "Body weight" })).toBeVisible();
  const entries = page.getByRole("button", { name: /^Delete entry for/ });
  await expect(entries).toHaveCount(2);
  // Body fat gets its own chart once two entries have it
  const bodyFat = page.getByRole("figure").filter({ hasText: "Body fat" });
  await expect(bodyFat).toHaveCount(0);
  await log.getByLabel("Date").fill(new Date(Date.now() - 1 * 864e5).toISOString().slice(0, 10));
  await log.getByLabel("Weight (kg)").fill("78.6");
  await log.getByLabel("Body fat %").fill("21");
  await log.getByRole("button", { name: "Save" }).click();
  await expect(entries).toHaveCount(3);
  await expect(bodyFat).toBeVisible();

  // Remove today's weigh-in; saving settings without changing weight must not recreate it
  await entries.first().click();
  await expect(entries).toHaveCount(2);
  await page.goto("/settings/profile");
  await page.getByRole("button", { name: "Build muscle" }).click();
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved")).toBeVisible();
  await page.goto("/progress");
  await expect(page.getByRole("button", { name: /^Delete entry for/ })).toHaveCount(2);
});

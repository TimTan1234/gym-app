import { expect, test, type Page } from "@playwright/test";
import { signUpAndOnboard } from "./helpers";

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("change password, download data, then delete the account and everything in it", async ({ page }) => {
  const email = await signUpAndOnboard(page);

  // A custom exercise used in a finished workout...
  await page.goto("/train/exercises");
  await page.getByRole("button", { name: "Custom exercise" }).click();
  await page.getByLabel("Name").fill("Sled Push");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Exercise added")).toBeVisible();
  await page.goto("/train");
  await page.getByRole("button", { name: "Empty workout" }).first().click();
  await expect(page).toHaveURL(/\/train\/workout\//);
  await page.getByRole("button", { name: "Add exercise" }).click();
  await page.getByLabel("Search exercises").fill("sled");
  await page.getByRole("button", { name: /^Sled Push/ }).click();
  const block = page.getByTestId("exercise-block").filter({ hasText: "Sled Push" });
  await block.getByLabel("kg").fill("80");
  await block.getByLabel("Reps").fill("10");
  await block.getByRole("button", { name: "Log set for Sled Push" }).click();
  await expect(block.getByRole("button", { name: /^Edit set/ })).toHaveCount(1);
  await page.getByRole("button", { name: "Finish" }).click();
  await page.getByRole("button", { name: "Save workout" }).click();
  await expect(page).toHaveURL(/\/train\/history\//);
  // ...and in a plan.
  await page.goto("/train/plans/new");
  await page.getByRole("button", { name: "Build manually" }).click();
  await page.getByRole("button", { name: "Add exercise" }).click();
  await page.getByLabel("Search exercises").fill("sled");
  await page.getByRole("button", { name: /^Sled Push/ }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/train\/plans$/);

  // Export: the user's own workouts, with units in the column names.
  const csv = await page.request.get("/api/export/workouts");
  expect(csv.headers()["content-type"]).toContain("text/csv");
  const text = await csv.text();
  expect(text).toContain("weight_kg");
  expect(text).toContain("Sled Push,1,false,80,10");
  expect((await page.request.get("/api/export/nonsense")).status()).toBe(404);

  // Change password: the wrong current one is refused, the right one works.
  // Settings is a list; each row opens its own page, with a way back.
  await page.goto("/settings");
  await page.getByRole("link", { name: "Account" }).click();
  await expect(page).toHaveURL(/\/settings\/account$/);
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await page.getByRole("link", { name: "Account" }).click();
  const account = page.locator("form").filter({ has: page.getByLabel("Current password") });
  await account.getByLabel("Current password").fill("wrong-password");
  await account.getByLabel("New password").fill("new-password-456");
  await account.getByRole("button", { name: "Change password" }).click();
  await expect(account.getByRole("alert")).toBeVisible();
  await account.getByLabel("Current password").fill("password123");
  await account.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Password changed")).toBeVisible();

  // Delete: warned, then asked for the (new) password.
  await page.getByRole("button", { name: "Delete account" }).click();
  await expect(page.getByText("It can't be undone.")).toBeVisible();
  const remove = page.locator("form").filter({ has: page.getByRole("button", { name: "Delete my account and data" }) });
  await remove.getByLabel("Password").fill("password123");
  await remove.getByRole("button", { name: "Delete my account and data" }).click();
  await expect(remove.getByRole("alert")).toBeVisible();
  await remove.getByLabel("Password").fill("new-password-456");
  await remove.getByRole("button", { name: "Delete my account and data" }).click();
  await expect(page).not.toHaveURL(/\/settings/);

  // Gone: signing in fails, and the export no longer answers.
  await signIn(page, email, "new-password-456");
  await expect(page.getByText("Invalid email or password")).toBeVisible();
  expect((await page.request.get("/api/export/workouts")).status()).toBe(401);
});

test("without SMTP, sign-in offers no password reset", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Forgot password?" })).toHaveCount(0);
  await page.goto("/forgot-password");
  await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send reset link" })).toHaveCount(0);
});

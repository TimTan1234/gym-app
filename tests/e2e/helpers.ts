import { expect, type Page } from "@playwright/test";

export async function signUpAndOnboard(page: Page, name = "Alex Tan") {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.dev`;
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("Date of birth").fill("1995-06-15");
  await page.getByLabel("Height (cm)").fill("175");
  await page.getByLabel("Weight (kg)").fill("78");
  await page.getByRole("button", { name: "Calculate my targets" }).click();
  await expect(page).toHaveURL(/\/today/);
  return email;
}

import { expect, test } from "@playwright/test";
import { signUpAndOnboard } from "./helpers";

test("add exercise: identify it from a photo or a description of the equipment", async ({ page }) => {
  await signUpAndOnboard(page);
  await page.goto("/train");
  await page.getByRole("button", { name: "Empty workout" }).first().click();
  await expect(page).toHaveURL(/\/train\/workout\//);

  // A photo of the machine lists the exercises done on it.
  await page.getByRole("button", { name: "Add exercise" }).click();
  const picker = page.getByRole("dialog", { name: "Add exercise" });
  await picker.getByTestId("identify-photo-input").setInputFiles("tests/fixtures/grocery-list.jpg");
  const found = picker.getByRole("region", { name: "Looks like Leg press machine" });
  await expect(found.getByRole("button", { name: /^Leg Press/ })).toHaveCount(2);
  await found.getByRole("button", { name: /^Leg Press/ }).first().click();
  await expect(page.getByTestId("exercise-block").filter({ hasText: "Leg Press" })).toHaveCount(1);

  // A description that matches no name can be handed to the AI instead.
  await page.getByRole("button", { name: "Add exercise" }).click();
  await picker.getByLabel("Search exercises").fill("sit and push a platform with my feet");
  await picker.getByRole("button", { name: /^Ask AI what/ }).click();
  await expect(picker.getByRole("region", { name: "Looks like Leg press machine" }).getByRole("button", { name: /^Leg Press Calf Raise/ })).toBeVisible();
});

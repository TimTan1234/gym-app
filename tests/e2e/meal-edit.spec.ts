import { expect, test } from "@playwright/test";
import { signUpAndOnboard } from "./helpers";

test("sugar shows in the analysis and the day; a logged meal can be edited", async ({ page }) => {
  await signUpAndOnboard(page);
  await page.goto("/nutrition/log");
  await page.getByRole("radio", { name: "Lunch" }).click();
  await page.getByLabel("Meal description").fill("nasi lemak with fried chicken");
  await page.getByRole("button", { name: "Analyse with AI" }).click();

  // Each analysed item has editable total and added sugar (the mock sambal: 4 g, 3 g added)
  const sambal = page.getByTestId("draft-item").filter({ has: page.getByLabel("Food name").and(page.locator('[value="Sambal"]')) });
  await expect(sambal.getByLabel("Sugar", { exact: true })).toHaveValue("4");
  await expect(sambal.getByLabel("Added sugar")).toHaveValue("3");

  // Added sugar is part of the total: typing one keeps the other consistent
  await sambal.getByLabel("Added sugar").fill("6");
  await expect(sambal.getByLabel("Sugar", { exact: true })).toHaveValue("6");
  await sambal.getByLabel("Sugar", { exact: true }).fill("2");
  await expect(sambal.getByLabel("Added sugar")).toHaveValue("2");
  await sambal.getByLabel("Sugar", { exact: true }).fill("4");
  await sambal.getByLabel("Added sugar").fill("3");

  // A sweet drink pushes the meal over the high-sugar line
  await page.getByRole("button", { name: "Add item manually" }).click();
  const drink = page.getByTestId("draft-item").last();
  await drink.getByLabel("Food name").fill("Teh tarik");
  await drink.getByLabel("kcal").fill("150");
  await drink.getByLabel("Sugar", { exact: true }).fill("30");
  await drink.getByLabel("Added sugar").fill("30");
  await expect(page.getByText("Sugar 35 g, 33 g added, high")).toBeVisible();
  await page.getByRole("button", { name: "Save meal" }).click();

  await expect(page).toHaveURL(/\/nutrition$/);
  await expect(page.getByTestId("sugar-meter")).toContainText("Total sugar today, including fruit and milk: 35 g");
  await expect(page.getByRole("meter", { name: "Added sugar" })).toHaveAttribute("aria-valuenow", "33");
  const meal = page.getByRole("button", { name: /Nasi lemak with fried chicken/ });
  await expect(meal).toContainText("Sugar 35 g, 33 g added, high");
  await expect(meal).toContainText("1039");

  // Edit: drop the drink, halve the rice, move it to dinner
  await meal.click();
  await page.getByRole("link", { name: "Edit Nasi lemak with fried chicken" }).click();
  await expect(page).toHaveURL(/\/nutrition\/log\?meal=/);
  await expect(page.getByRole("heading", { name: "Edit meal" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Lunch" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("draft-item")).toHaveCount(6);
  await page.getByRole("button", { name: "Remove Teh tarik" }).click();
  await page.getByTestId("draft-item").first().getByLabel("Grams").fill("100");
  await page.getByRole("radio", { name: "Dinner" }).click();
  await expect(page.getByTestId("draft-total-kcal")).toHaveText("719");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page).toHaveURL(/\/nutrition$/);
  await expect(page.getByText("Meal updated")).toBeVisible();
  const dinner = page.locator("section", { has: page.getByRole("heading", { name: /^Dinner/ }) });
  const edited = dinner.getByRole("button", { name: /Nasi lemak with fried chicken/ });
  await expect(edited).toContainText("719");
  await expect(edited).toContainText("Sugar 5 g, 3 g added");
  await expect(edited).not.toContainText("high");
  await expect(page.getByRole("button", { name: /Nasi lemak with fried chicken/ })).toHaveCount(1);

  // Editing again starts from the saved meal, not the earlier draft
  await edited.click();
  await page.getByRole("link", { name: "Edit Nasi lemak with fried chicken" }).click();
  await expect(page.getByTestId("draft-item")).toHaveCount(5);
  await expect(page.getByTestId("draft-item").first().getByLabel("Grams")).toHaveValue("100");
});

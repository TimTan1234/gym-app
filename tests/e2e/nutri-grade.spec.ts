import { expect, test } from "@playwright/test";
import { signUpAndOnboard } from "./helpers";

test("drinks carry a Nutri-Grade through the draft, the day and the export; food has none", async ({ page }) => {
  await signUpAndOnboard(page);
  await page.goto("/nutrition/log");
  await page.getByRole("radio", { name: "Breakfast" }).click();
  await page.getByLabel("Meal description").fill("teh tarik, kopi o kosong and kopi c kosong");
  await page.getByRole("button", { name: "Analyse with AI" }).click();

  // The mock teh tarik: 250 ml with 20 g sugar and 2.5 g saturated fat, 8 g and 1 g per 100 ml: sugar sets its C
  const draft = (name: string) => page.getByTestId("draft-item").filter({ has: page.locator(`[value="${name}"]`) });
  const tehTarik = draft("Teh tarik");
  await expect(tehTarik.getByRole("img", { name: "Nutri-Grade C" })).toBeVisible();
  await expect(tehTarik.getByText("8 g sugar, 1 g saturated fat per 100 ml")).toBeVisible();
  await expect(draft("Kopi O kosong").getByRole("img", { name: "Nutri-Grade A" })).toBeVisible();
  // Kopi with evaporated milk: little sugar, but the milk's saturated fat makes it C
  await expect(draft("Kopi C kosong").getByRole("img", { name: "Nutri-Grade C" })).toBeVisible();
  await expect(draft("Kopi C kosong").getByText("2.4 g sugar, 1.28 g saturated fat per 100 ml")).toBeVisible();

  // A bigger mug is the same drink: its volume and saturated fat scale with the grams, so the grade holds
  await tehTarik.getByLabel("Grams").fill("500");
  await expect(tehTarik.getByRole("img", { name: "Nutri-Grade C" })).toBeVisible();
  await expect(tehTarik.getByText("8 g sugar, 1 g saturated fat per 100 ml")).toBeVisible();
  await page.getByRole("button", { name: "Save meal" }).click();

  // On the day: the meal's row has one scale, for its worst drink; the item list grades each drink
  await expect(page).toHaveURL(/\/nutrition$/);
  const meal = page.getByRole("button", { name: /Teh tarik and two kopi/ });
  await expect(meal.getByRole("img", { name: /Nutri-Grade/ })).toHaveCount(1);
  await expect(meal.getByRole("img", { name: "Teh tarik: Nutri-Grade C" })).toBeVisible();
  await meal.click();
  const item = (name: string) => page.getByRole("listitem").filter({ hasText: name });
  await expect(item("Teh tarik").getByRole("img", { name: "Nutri-Grade C" })).toBeVisible();
  await expect(item("Kopi O kosong").getByText("0 g sugar, 0 g saturated fat per 100 ml")).toBeVisible();

  // Food gets no grade
  await page.goto("/nutrition/log");
  await page.getByLabel("Meal description").fill("nasi lemak with fried chicken");
  await page.getByRole("button", { name: "Analyse with AI" }).click();
  await expect(page.getByTestId("draft-item")).toHaveCount(5);
  await expect(page.getByRole("img", { name: /Nutri-Grade/ })).toHaveCount(0);

  const csv = await (await page.request.get("/api/export/meals")).text();
  expect(csv).toContain(",saturated_fat_g,volume_ml,sweetener,nutri_grade\r\n");
  expect(csv).toMatch(/,Teh tarik,1,mug,500,.*,5,500,false,C\r\n/);
});

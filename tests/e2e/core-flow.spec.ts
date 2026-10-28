import { expect, test } from "@playwright/test";

test("sign up → onboarding → log meal → log workout → history", async ({ page }) => {
  const email = `e2e-${Date.now()}@test.dev`;

  // Sign up
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Alex Tan");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();

  // Onboarding
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("Date of birth").fill("1995-06-15");
  await page.getByLabel("Height (cm)").fill("175");
  await page.getByLabel("Weight (kg)").fill("78");
  await page.getByRole("button", { name: "Lose fat" }).click();
  await page.getByRole("button", { name: "Calculate my targets" }).click();

  // Today dashboard shows computed targets
  await expect(page).toHaveURL(/\/today/);
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening), Alex/ })).toBeVisible();
  await expect(page.getByText("kcal left today")).toBeVisible();
  await expect(page.getByRole("img", { name: /of [\d,]+ kcal eaten/ })).toBeVisible();

  // Log a meal with (mocked) AI
  await page.getByRole("link", { name: "Log meal" }).first().click();
  await expect(page).toHaveURL(/\/nutrition\/log/);
  await page.getByRole("radio", { name: "Lunch" }).click();
  await page.getByLabel("Meal description").fill("nasi lemak with fried chicken");
  await page.getByRole("button", { name: "Analyse with AI" }).click();
  await expect(page.getByText("Review & adjust")).toBeVisible();
  await expect(page.getByLabel("Food name").first()).toHaveValue("Coconut rice");

  // Halve the rice: 200 g → 100 g scales 340 kcal → 170 kcal
  const riceRow = page.getByTestId("draft-item").first();
  await riceRow.getByLabel("Grams").fill("100");
  await expect(riceRow.getByLabel("kcal")).toHaveValue("170");
  await page.getByRole("button", { name: "Save meal" }).click();

  // Nutrition day view includes the meal; mock totals: 889 kcal - 170 = 719 kcal
  await expect(page).toHaveURL(/\/nutrition$/);
  await expect(page.getByRole("button", { name: /Nasi lemak with fried chicken/ })).toBeVisible();
  await expect(page.getByText("719", { exact: true }).first()).toBeVisible();

  // Photo path: several photos (gallery + camera) → client resize → data URLs → route validation → draft
  await page.getByRole("link", { name: "Log meal" }).click();
  await page.getByTestId("meal-photos-input").setInputFiles(["public/icons/icon-512.png", "public/icons/icon-192.png"]);
  await expect(page.getByAltText("Meal photo 2")).toBeVisible();
  await page.getByTestId("meal-camera-input").setInputFiles("public/icons/maskable-512.png");
  await expect(page.getByAltText("Meal photo 3")).toBeVisible();
  await page.getByRole("button", { name: "Remove photo 1" }).click();
  await expect(page.getByRole("list", { name: "Meal photos" }).getByRole("img")).toHaveCount(2);
  // Only one more fits under the limit of 4.
  await page.getByTestId("meal-photos-input").setInputFiles(["public/icons/icon-512.png", "public/icons/icon-192.png", "public/icons/apple-touch-icon.png"]);
  await expect(page.getByText("Add up to 4 photos per meal")).toBeVisible();
  await expect(page.getByRole("list", { name: "Meal photos" }).getByRole("img")).toHaveCount(4);
  await expect(page.getByRole("button", { name: "Add photo" })).toBeDisabled();
  await page.getByRole("button", { name: "Analyse with AI" }).click();
  await expect(page.getByTestId("draft-item")).toHaveCount(5);
  await page.getByRole("button", { name: "Save meal" }).click();
  await expect(page).toHaveURL(/\/nutrition$/);
  await expect(page.getByRole("button", { name: /Nasi lemak with fried chicken/ })).toHaveCount(2);

  // The route enforces the photo limit itself and still takes the single `image` older clients send.
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const analyse = (data: object) => page.request.post("/api/ai/meal", { data });
  const tooMany = await analyse({ images: Array(5).fill(png) });
  expect(tooMany.status()).toBe(400);
  expect((await tooMany.json()).error).toBe("Add up to 4 photos per meal");
  const badFormat = await analyse({ images: [png, "data:image/gif;base64,R0lGOD"] });
  expect(badFormat.status()).toBe(400);
  expect((await badFormat.json()).error).toBe("Unsupported image format");
  const nothing = await analyse({ images: [] });
  expect(nothing.status()).toBe(400);
  expect((await nothing.json()).error).toBe("Describe the meal or add a photo");
  const legacy = await analyse({ image: png });
  expect(legacy.status()).toBe(200);
  expect((await legacy.json()).analysis.items.length).toBeGreaterThan(0);

  // Start an empty workout and log sets
  await page.getByRole("link", { name: "Train" }).click();
  await page.getByRole("button", { name: "Empty workout" }).first().click();
  await expect(page).toHaveURL(/\/train\/workout\//);
  await page.getByRole("button", { name: "Add exercise" }).click();
  await page.getByLabel("Search exercises").fill("barbell bench");
  await page.getByRole("button", { name: /^Barbell Bench Press/ }).click();

  const block = page.getByTestId("exercise-block").filter({ hasText: "Barbell Bench Press" });
  for (const [kg, reps] of [["60", "8"], ["60", "8"], ["62.5", "6"]]) {
    await block.getByLabel("kg").fill(kg);
    await block.getByLabel("Reps").fill(reps);
    await block.getByRole("button", { name: "Log set for Barbell Bench Press" }).click();
  }
  await expect(block.getByRole("button", { name: /^Delete set/ })).toHaveCount(3);
  await expect(page.getByRole("timer")).toBeVisible(); // rest timer started

  await page.getByRole("button", { name: "Finish" }).click();
  await page.getByRole("button", { name: "Save workout" }).click();

  // Session detail
  await expect(page).toHaveURL(/\/train\/history\//);
  await expect(page.getByRole("link", { name: "Barbell Bench Press" })).toBeVisible();
  // Volume 60×8 + 60×8 + 62.5×6 = 1,335 kg
  const volume = page.locator("dl > div", { hasText: "kg lifted" });
  await expect(volume.locator("dd")).toHaveText("1,335");
});

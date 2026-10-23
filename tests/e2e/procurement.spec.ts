import { expect, test } from "@playwright/test";
import { signUpAndOnboard } from "./helpers";

// AI_MOCK=1: every import or generation returns src/lib/ai/fixtures/procurement.json
// (9 items, RM 98.60 estimated, budget RM 120, 4 meals).

test("import a pasted list → edit the draft → shop → budget → nutrition → saved foods → log a meal", async ({ page }) => {
  await signUpAndOnboard(page);
  await page.goto("/nutrition");
  await page.getByRole("link", { name: "Groceries" }).click();
  await expect(page).toHaveURL(/\/nutrition\/procurement$/);
  await expect(page.getByText("No grocery plans yet")).toBeVisible();

  await page.getByRole("link", { name: "Import" }).click();
  await page.getByLabel("Or paste the list or meal plan").fill("2 kg chicken breast, 1 tray eggs, brown rice, broccoli");
  await page.getByRole("button", { name: "Read plan" }).click();
  await expect(page.getByRole("heading", { name: "Check the plan" })).toBeVisible();
  await expect(page.getByTestId("draft-grocery")).toHaveCount(9);
  await expect(page.getByTestId("draft-total-cost")).toContainText("98.60");

  // Drop the non-food item; the total follows.
  await page.getByRole("button", { name: "Remove Dishwashing liquid" }).click();
  await expect(page.getByTestId("draft-grocery")).toHaveCount(8);
  await expect(page.getByTestId("draft-total-cost")).toContainText("94.10");
  // Changing the household after the AI estimated shares asks for a new estimate.
  await page.getByLabel("People").fill("2");
  await expect(page.getByText(/Days or people changed/)).toBeVisible();
  await page.getByLabel("People").fill("1");
  await expect(page.getByText(/Days or people changed/)).toHaveCount(0);
  await page.getByRole("button", { name: "Save plan" }).click();
  await expect(page).toHaveURL(/\/nutrition\/procurement\/[^/?]+$/);
  await expect(page.getByRole("heading", { name: "Weekly groceries" })).toBeVisible();

  // Shopping mode: tick an item off and note what it cost.
  const progress = page.getByTestId("shop-progress");
  await expect(progress).toContainText("0 of 8 bought");
  // The list updates at once; wait for each server action so the reload sees it.
  const actionDone = () => page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/nutrition/procurement/"));
  let saved = actionDone();
  await page.getByRole("checkbox", { name: /Chicken breast/ }).click();
  await expect(progress).toContainText("1 of 8 bought");
  await saved;
  // A bought item's price is tapped to note what it cost; the expected total follows (94.10 - 24 + 20).
  const paid = page.getByRole("button", { name: "Enter what you paid for Chicken breast" });
  await expect(paid).toContainText("≈ 24.00");
  await paid.click();
  await page.getByLabel("Paid for Chicken breast (MYR)").fill("20");
  saved = actionDone();
  await page.getByLabel("Paid for Chicken breast (MYR)").blur();
  await expect(progress).toContainText("90.10");
  await saved;
  await page.reload();
  await expect(page.getByTestId("shop-progress")).toContainText("1 of 8 bought");
  await expect(page.getByRole("checkbox", { name: /Chicken breast/ })).toHaveAttribute("aria-checked", "true");
  await expect(paid).toHaveText("20.00");

  // Budget: paid price replaces the estimate (94.10 - 24 + 20).
  await page.getByRole("link", { name: "Budget" }).click();
  const budget = page.getByTestId("budget-view");
  await expect(budget).toContainText("90.10");
  await expect(budget).toContainText("29.90 left in budget");

  // Nutrition, then save the bought chicken to Saved Foods (per 100 g: 2310 kcal / 1400 g).
  await page.getByRole("link", { name: "Nutrition" }).click();
  await expect(page.getByTestId("nutrition-check")).toBeVisible();
  await page.getByRole("button", { name: "Add to Saved Foods (1)" }).click();
  await expect(page.getByText("Added 1; 0 already saved")).toBeVisible();

  // Meals: Log opens the meal logger with the description filled in.
  await page.getByRole("link", { name: "Meals" }).click();
  await page.getByRole("link", { name: "Log Oats with banana and milk" }).click();
  await expect(page).toHaveURL(/\/nutrition\/log\?type=BREAKFAST/);
  await expect(page.getByLabel("Meal description")).toHaveValue("Oats with banana and milk");
  await expect(page.getByRole("button", { name: /^Chicken breast 165 kcal/ })).toBeVisible();
});

test("generate a plan, import a Markdown file, reject a scanned PDF, finish a plan", async ({ page }) => {
  await signUpAndOnboard(page);

  // Generate with AI.
  await page.goto("/nutrition/procurement/new?mode=generate");
  await page.getByLabel("Days").fill("5");
  // Numbers can be cleared and retyped key by key, as on a phone keyboard.
  const people = page.getByLabel("People");
  await people.click();
  await people.press("Backspace");
  await expect(people).toHaveValue("");
  await people.pressSequentially("3");
  await expect(people).toHaveValue("3");
  await page.getByLabel("Preferences").fill("halal, quick dinners");
  await page.getByRole("button", { name: "Generate plan" }).click();
  await expect(page.getByRole("heading", { name: "Check the plan" })).toBeVisible();
  await expect(page.getByLabel("Days")).toHaveValue("5");
  await expect(page.getByLabel("People")).toHaveValue("3");
  // A generated plan comes without nutrition, so it's quick; it's estimated on demand after saving.
  await expect(page.getByTestId("estimate-after-save")).toBeVisible();
  await expect(page.getByTestId("nutrition-check")).toHaveCount(0);
  await page.getByRole("button", { name: "Save plan" }).click();
  await expect(page).toHaveURL(/\/nutrition\/procurement\/[^/?]+$/);
  await expect(page.getByText("5 days for 3 people")).toBeVisible();
  await page.getByRole("link", { name: "Nutrition" }).click();
  await page.getByRole("button", { name: "Estimate (9)" }).click();
  await expect(page.getByText("Nutrition estimated for 9 items")).toBeVisible();
  await expect(page.locator('[data-testid="nutrition-check"]:visible')).toBeVisible();
  await expect(page.getByRole("button", { name: /^Estimate/ })).toHaveCount(0);

  // Finish it: it moves to past plans.
  await page.getByRole("button", { name: "Plan options" }).click();
  await page.getByRole("button", { name: "Mark as done" }).click();
  await expect(page.getByText("Done", { exact: true })).toBeVisible();
  await page.goto("/nutrition/procurement");
  await expect(page.getByText("Past plans (1)")).toBeVisible();

  // A scanned PDF has no text: the user is told to take a photo.
  await page.goto("/nutrition/procurement/new?mode=import");
  // Pick files through the button, as a user would; retried until the page has hydrated.
  const pick = (path: string, name: string) =>
    expect(async () => {
      const chooser = page.waitForEvent("filechooser", { timeout: 2_000 });
      await page.getByRole("button", { name: "Choose files" }).click();
      await (await chooser).setFiles(path);
      await expect(page.getByText(name)).toBeVisible({ timeout: 2_000 });
    }).toPass();
  await pick("tests/fixtures/scanned.pdf", "scanned.pdf");
  await page.getByRole("button", { name: "Read plan" }).click();
  await expect(page.getByText(/no text in it \(it's a scan\)/)).toBeVisible();

  // A Markdown file is read.
  await page.getByRole("button", { name: "Remove scanned.pdf" }).click();
  await pick("tests/fixtures/groceries.md", "groceries.md");
  await page.getByRole("button", { name: "Read plan" }).click();
  await expect(page.getByTestId("draft-grocery")).toHaveCount(9);
  await page.getByRole("button", { name: "Save plan" }).click();
  await expect(page).toHaveURL(/\/nutrition\/procurement\/[^/?]+$/);
  await page.goto("/nutrition/procurement");
  await expect(page.getByTestId("procurement-plan")).toHaveCount(2);
});

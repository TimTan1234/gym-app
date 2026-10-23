import { expect, test, type Page } from "@playwright/test";
import { signUpAndOnboard } from "./helpers";

// Exercises the real AI provider end to end. Opt-in (costs tokens):
//   LIVE_AI=1 npx playwright test tests/e2e/live-ai.spec.ts
// The dev server must run with AI_MOCK=0 and a valid OPENAI_API_KEY.
test.skip(process.env.LIVE_AI !== "1", "set LIVE_AI=1 to call the real AI provider");
test.setTimeout(6 * 60_000);
test.use({ baseURL: "http://localhost:3000" });

const AI_TIMEOUT = 120_000;

async function readDraft(page: Page) {
  const rows = page.getByTestId("draft-item");
  const n = await rows.count();
  const items = [];
  for (let i = 0; i < n; i++) {
    const row = rows.nth(i);
    items.push({
      name: await row.getByLabel("Food name").inputValue(),
      grams: Number(await row.getByLabel("Grams").inputValue()),
      kcal: Number(await row.getByLabel("kcal").inputValue()),
      protein: Number(await row.getByLabel("Protein").inputValue()),
    });
  }
  const total = Number(await page.getByTestId("draft-total-kcal").textContent());
  return { items, total };
}

test("live AI: text meal, photo meal, plan, coach tools + proposal", async ({ page }) => {
  await signUpAndOnboard(page, "Live Tester");

  // 1) Text meal
  await page.goto("/nutrition/log");
  await page.getByRole("radio", { name: "Breakfast" }).click();
  await page.getByLabel("Meal description").fill("2 roti canai with dhal curry and 1 teh tarik");
  await page.getByRole("button", { name: "Analyse with AI" }).click();
  await expect(page.getByTestId("draft-item").first()).toBeVisible({ timeout: AI_TIMEOUT });
  const text = await readDraft(page);
  console.log("TEXT MEAL", JSON.stringify(text, null, 1));
  expect(text.items.length).toBeGreaterThanOrEqual(2);
  expect(text.total).toBeGreaterThan(450);
  expect(text.total).toBeLessThan(1500);
  expect(text.items.map((i) => i.name.toLowerCase()).join(" ")).toMatch(/roti/);
  await page.getByRole("button", { name: "Save meal" }).click();
  await expect(page).toHaveURL(/\/nutrition$/);

  // 2) Photo meal (CC0 nasi lemak photo)
  await page.goto("/nutrition/log");
  await page.getByRole("radio", { name: "Lunch" }).click();
  await page.locator('input[type="file"]').setInputFiles("tests/fixtures/nasi-lemak.jpg");
  await expect(page.getByAltText("Meal photo preview")).toBeVisible();
  await page.getByRole("button", { name: "Analyse with AI" }).click();
  await expect(page.getByTestId("draft-item").first()).toBeVisible({ timeout: AI_TIMEOUT });
  const photo = await readDraft(page);
  console.log("PHOTO MEAL", JSON.stringify(photo, null, 1));
  expect(photo.items.length).toBeGreaterThanOrEqual(3);
  expect(photo.items.map((i) => i.name.toLowerCase()).join(" ")).toMatch(/rice/);
  expect(photo.total).toBeGreaterThan(500);
  expect(photo.total).toBeLessThan(2000);
  await page.getByRole("button", { name: "Save meal" }).click();
  await expect(page).toHaveURL(/\/nutrition$/);

  // 3) AI plan: 3 days, dumbbells only
  await page.goto("/train/plans/new");
  await page.getByRole("button", { name: "Build muscle" }).click();
  await page.getByLabel("Days / week").selectOption("3");
  await page.getByLabel("Minutes").selectOption("45");
  for (const eq of ["Barbell & rack", "Machines", "Cable station"]) {
    const btn = page.getByRole("button", { name: eq });
    if ((await btn.getAttribute("aria-pressed")) === "true") await btn.click();
  }
  await page.getByRole("button", { name: "Dumbbells" }).click().catch(() => {});
  if ((await page.getByRole("button", { name: "Dumbbells" }).getAttribute("aria-pressed")) !== "true") {
    await page.getByRole("button", { name: "Dumbbells" }).click();
  }
  await page.getByLabel("Injuries or limitations").fill("Mild lower back sensitivity");
  await page.getByRole("button", { name: "Generate plan" }).click();
  await expect(page.getByTestId("plan-day").first()).toBeVisible({ timeout: AI_TIMEOUT });
  const days = page.getByTestId("plan-day");
  await expect(days).toHaveCount(3);
  const plan = [];
  for (let i = 0; i < 3; i++) {
    const d = days.nth(i);
    plan.push({
      name: await d.getByLabel(`Day ${i + 1} name`).inputValue(),
      exercises: await d.locator("li span.flex-1").allTextContents(),
    });
  }
  console.log("PLAN", JSON.stringify(plan, null, 1));
  for (const d of plan) expect(d.exercises.length).toBeGreaterThanOrEqual(3);
  const all = plan.flatMap((d) => d.exercises).join(" | ");
  expect(all).not.toMatch(/Barbell|Machine|Cable|Smith/);
  await page.getByRole("button", { name: "Save & activate" }).click();
  await expect(page).toHaveURL(/\/train\/plans$/);

  // 4) Coach must use tools to answer with real numbers
  await page.goto("/settings");
  const proteinTarget = await page.locator("input[name=protein]").inputValue();
  const kcalTarget = Number(await page.getByLabel("kcal").inputValue());
  await page.goto("/coach");
  await page.getByLabel("Message the coach").fill("What is my daily protein target, and how much protein have I eaten today so far?");
  await page.getByRole("button", { name: "Send" }).click();
  const chat = page.getByTestId("chat-log");
  const answer = page.locator("div.rounded-bl-md").last();
  await expect(chat).toHaveAttribute("aria-busy", "true");
  await expect(chat).toHaveAttribute("aria-busy", "false", { timeout: AI_TIMEOUT });
  await expect(page).toHaveURL(/thread=/);
  const reply1 = await answer.innerText();
  console.log("COACH 1", reply1);
  expect(reply1).toContain(proteinTarget);

  // 5) Coach proposal → apply
  await page.getByLabel("Message the coach").fill(`Please lower my daily calorie target by exactly 200 kcal (from ${kcalTarget}). Keep protein the same.`);
  await page.getByRole("button", { name: "Send" }).click();
  const proposal = page.getByTestId("proposal").last();
  await expect(chat).toHaveAttribute("aria-busy", "false", { timeout: AI_TIMEOUT });
  await expect(proposal).toBeVisible();
  console.log("COACH 2", await page.locator("div.rounded-bl-md").last().innerText());
  await expect(proposal.locator("dd").first()).toHaveText((kcalTarget - 200).toLocaleString("en-US"));
  await expect(proposal.getByRole("button", { name: "Apply" })).toBeEnabled({ timeout: AI_TIMEOUT });
  await proposal.getByRole("button", { name: "Apply" }).click();
  await expect(proposal.getByRole("button", { name: "Applied" })).toBeVisible();
  await page.goto("/settings");
  await expect(page.getByLabel("kcal")).toHaveValue(String(kcalTarget - 200));
});

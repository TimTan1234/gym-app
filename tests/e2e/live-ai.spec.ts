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

async function readGroceryDraft(page: Page) {
  const rows = page.getByTestId("draft-grocery");
  const n = await rows.count();
  const items = [];
  for (let i = 0; i < n; i++) {
    const row = rows.nth(i);
    const price = await row.getAttribute("data-price");
    items.push({
      name: (await row.getAttribute("data-name")) ?? "",
      quantity: await row.getAttribute("data-quantity"),
      unit: await row.getAttribute("data-unit"),
      price: price ? Number(price) : null,
    });
  }
  const cost = await page.getByTestId("draft-total-cost").textContent();
  const check = page.locator('[data-testid="nutrition-check"]:visible');
  const perDay = (await check.count()) > 0 ? (await check.innerText()).replace(/\s+/g, " ") : null;
  return { items, cost, perDay };
}

test("live AI: grocery list photo, Word and PDF imports, generated plan", async ({ page }) => {
  test.setTimeout(12 * 60_000);
  await signUpAndOnboard(page, "Live Shopper");
  const pick = (path: string, name: string) =>
    expect(async () => {
      const chooser = page.waitForEvent("filechooser", { timeout: 2_000 });
      await page.getByRole("button", { name: "Choose files" }).click();
      await (await chooser).setFiles(path);
      await expect(page.getByText(name)).toBeVisible({ timeout: 2_000 });
    }).toPass();
  const review = page.getByRole("heading", { name: "Check the plan" });

  // 1) Photo of a list (vision): items, the prices written on it, a sensible share of nutrition.
  await page.goto("/nutrition/procurement/new?mode=import");
  await pick("tests/fixtures/grocery-list.jpg", "grocery-list.jpg");
  await page.getByRole("button", { name: "Read plan" }).click();
  await expect(review).toBeVisible({ timeout: AI_TIMEOUT });
  const photo = await readGroceryDraft(page);
  console.log("GROCERY PHOTO", JSON.stringify(photo, null, 1));
  const names = photo.items.map((i) => i.name.toLowerCase()).join(" | ");
  expect(photo.items.length).toBeGreaterThanOrEqual(8);
  for (const word of ["chicken", "egg", "rice", "broccoli", "banana", "milk", "oat", "tofu", "kicap"]) expect(names).toContain(word);
  expect(photo.items.find((i) => /chicken/i.test(i.name))?.price).toBe(24);
  expect(photo.items.find((i) => /milk/i.test(i.name))?.price).toBeCloseTo(13.8);
  await page.getByRole("button", { name: "Save plan" }).click();
  await expect(page).toHaveURL(/\/nutrition\/procurement\/[^/?]+$/, { timeout: 20_000 });
  await page.getByRole("link", { name: "Nutrition" }).click();
  await expect(page).toHaveURL(/view=nutrition/);
  // Visited pages stay mounted (hidden), so read the visible check, not the draft editor's.
  const check = page.locator('[data-testid="nutrition-check"]:visible');
  const kcalPerDay = Number((await check.innerText()).match(/kcal\s+(\d+)/)?.[1]);
  console.log("PHOTO PLAN kcal/day", kcalPerDay);
  // One person's share of a week's basic groceries: not all their food, but not absurd either.
  expect(kcalPerDay).toBeGreaterThan(300);
  expect(kcalPerDay).toBeLessThan(3500);

  // 2) Word and PDF documents.
  for (const file of ["groceries.docx", "groceries.pdf"]) {
    await page.goto("/nutrition/procurement/new?mode=import");
    await pick(`tests/fixtures/${file}`, file);
    await page.getByRole("button", { name: "Read plan" }).click();
    await expect(review).toBeVisible({ timeout: AI_TIMEOUT });
    const doc = await readGroceryDraft(page);
    console.log(file.toUpperCase(), JSON.stringify(doc, null, 1));
    const docNames = doc.items.map((i) => i.name.toLowerCase()).join(" | ");
    expect(docNames).toContain("chicken");
    expect(docNames).toContain("egg");
  }

  // 3) Generated plan within a budget, with meals.
  await page.goto("/nutrition/procurement/new?mode=generate");
  await page.getByLabel("Days").fill("3");
  await page.getByLabel("Budget (MYR)").fill("80");
  await page.getByLabel("Preferences").fill("halal, simple Malaysian home cooking");
  await page.getByRole("button", { name: "Generate plan" }).click();
  // Plans are long outputs; allow extra time on slow providers.
  const started = Date.now();
  await expect(review).toBeVisible({ timeout: 2 * AI_TIMEOUT });
  console.log("GENERATED in", Math.round((Date.now() - started) / 1000), "s");
  const generated = await readGroceryDraft(page);
  console.log("GENERATED", JSON.stringify(generated, null, 1));
  expect(generated.items.length).toBeGreaterThanOrEqual(5);
  await expect(page.getByText(/^Meals \(\d+\)$/)).toBeVisible();
  const total = generated.items.reduce((s, i) => s + (i.price ?? 0), 0);
  expect(total).toBeGreaterThan(20);
  expect(total).toBeLessThan(80 * 1.25);
  await expect(page.getByTestId("estimate-after-save")).toBeVisible();
  await page.getByRole("button", { name: "Save plan" }).click();
  await expect(page).toHaveURL(/\/nutrition\/procurement\/[^/?]+$/, { timeout: 20_000 });

  // 4) Its nutrition is estimated on demand, for every item in one go.
  await page.getByRole("link", { name: "Nutrition" }).click();
  await page.getByRole("button", { name: /^Estimate \(\d+\)$/ }).click();
  await expect(page.getByText(/^Nutrition estimated for \d+ items$/)).toBeVisible({ timeout: AI_TIMEOUT });
  const genCheck = page.locator('[data-testid="nutrition-check"]:visible');
  const genText = (await genCheck.innerText()).replace(/\s+/g, " ");
  const genKcal = Number(genText.match(/kcal (\d+)/)?.[1]);
  console.log("GENERATED PLAN estimated per day:", genText);
  // Planned around the targets; estimates are rough, so allow a wide band.
  expect(genKcal).toBeGreaterThan(800);
  expect(genKcal).toBeLessThan(4000);
});

test("live AI: grocery item typed in by hand gets its nutrition estimated", async ({ page }) => {
  await signUpAndOnboard(page, "Live Estimator");
  await page.goto("/nutrition/procurement/new?mode=blank");
  const row = page.getByTestId("draft-grocery");
  await row.getByLabel("Item", { exact: true }).fill("Greek yogurt");
  await row.getByLabel("Qty", { exact: true }).fill("500");
  await row.getByLabel("Unit", { exact: true }).fill("g");
  await page.getByRole("button", { name: "Save plan" }).click();
  await expect(page).toHaveURL(/\/nutrition\/procurement\/[^/?]+$/, { timeout: 20_000 });
  await page.getByRole("link", { name: "Nutrition" }).click();
  await page.getByRole("button", { name: "Estimate (1)" }).click();
  await expect(page.getByText("Nutrition estimated for 1 items")).toBeVisible({ timeout: AI_TIMEOUT });
  await expect(page.getByRole("button", { name: "Estimate (1)" })).toHaveCount(0);
  const check = page.locator('[data-testid="nutrition-check"]:visible');
  const kcal = Number((await check.innerText()).match(/kcal\s+(\d+)/)?.[1]);
  console.log("ESTIMATED yogurt kcal/day", kcal);
  // 500 g of Greek yogurt over 7 days: roughly 50-100 kcal a day.
  expect(kcal).toBeGreaterThan(20);
  expect(kcal).toBeLessThan(250);
});

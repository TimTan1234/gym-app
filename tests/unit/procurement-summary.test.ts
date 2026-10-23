import { describe, expect, it } from "vitest";
import { formatMoney, groupByCategory, nutritionCheck, planCost, planNutrition, planToMarkdown, targetStatus } from "@/lib/procurement/summary";
import { ProcurementDraftSchema } from "@/lib/ai/schemas";
import fixture from "@/lib/ai/fixtures/procurement.json";

const profile = {
  targetKcal: 2000,
  targetProteinG: 150,
  targetCarbsG: 200,
  targetFatG: 65,
  diabetesMode: false,
  sex: "MALE" as const,
  activityLevel: "SEDENTARY" as const,
};

const portion = (kcal: number, carbsG = 0, proteinG = 0, addedSugarG = 0) => ({
  kcal,
  proteinG,
  carbsG,
  fatG: 0,
  fiberG: 0,
  sugarG: addedSugarG,
  addedSugarG,
  sodiumMg: 0,
});

describe("planNutrition", () => {
  it("spreads the eaten share over the days and counts unestimated items", () => {
    const { perDay, missing } = planNutrition([portion(7000, 700), portion(1400), { kcal: null }], 7);
    expect(perDay.kcal).toBe(1200);
    expect(perDay.carbsG).toBe(100);
    expect(missing).toBe(1);
  });

  it("works on the AI fixture", () => {
    const draft = ProcurementDraftSchema.parse(fixture);
    const { perDay, missing } = planNutrition(draft.items, draft.days ?? 7);
    expect(missing).toBe(0);
    expect(perDay.kcal).toBeGreaterThan(1000);
    expect(perDay.kcal).toBeLessThan(2500);
  });
});

describe("nutritionCheck", () => {
  it("rates each macro against its target within 10%", () => {
    expect(targetStatus(85, 100)).toBe("under");
    expect(targetStatus(95, 100)).toBe("ok");
    expect(targetStatus(111, 100)).toBe("over");
    const { rows, flags } = nutritionCheck({ ...portion(2000, 200, 100), fatG: 65 }, profile);
    expect(rows.map((r) => [r.key, r.status])).toEqual([
      ["kcal", "ok"],
      ["proteinG", "under"],
      ["carbsG", "ok"],
      ["fatG", "ok"],
    ]);
    expect(flags).toEqual([]);
  });

  it("flags added sugar", () => {
    expect(nutritionCheck(portion(2000, 200, 100, 40), profile).flags).toContain("addedSugarHigh");
  });

  it("checks the diabetes carb budget and protein share only in diabetes mode", () => {
    const diabetic = { ...profile, diabetesMode: true };
    // Sedentary man: 3-5 exchanges a meal, so 3 × 75 + 30 = 255 g a day at most.
    const high = nutritionCheck(portion(2000, 300, 80), diabetic);
    expect(high.carbDailyMax).toBe(255);
    expect(high.flags).toContain("carbsOverBudget");
    const low = nutritionCheck(portion(2000, 100, 120), diabetic);
    expect(low.flags).toEqual(expect.arrayContaining(["carbsUnderMin", "proteinOverShare"]));
    expect(nutritionCheck(portion(2000, 100, 120), profile).flags).toEqual([]);
  });
});

describe("planCost", () => {
  const items = [
    { category: "PRODUCE" as const, estPrice: 10, actualPrice: 12, checked: true },
    { category: "PRODUCE" as const, estPrice: 5, actualPrice: null, checked: true },
    { category: "MEAT_SEAFOOD" as const, estPrice: 30, actualPrice: null, checked: false },
    { category: "OTHER" as const, estPrice: null, actualPrice: null, checked: false },
  ];

  it("uses what was paid for bought items and the estimate otherwise", () => {
    const cost = planCost(items, 50);
    expect(cost.estimated).toBe(45);
    expect(cost.spent).toBe(17);
    expect(cost.projected).toBe(47);
    expect(cost.remaining).toBe(3);
    expect(cost.overBudget).toBe(false);
    expect(cost.unpriced).toBe(1);
    expect(cost.byCategory).toEqual([
      { category: "PRODUCE", amount: 17 },
      { category: "MEAT_SEAFOOD", amount: 30 },
    ]);
  });

  it("warns when over budget and has no remaining without a budget", () => {
    expect(planCost(items, 40).overBudget).toBe(true);
    expect(planCost(items, null).remaining).toBeNull();
  });
});

describe("grouping and sharing", () => {
  const items = [
    { name: "Milk", quantity: 1, unit: "L", category: "DAIRY_EGGS" as const, estPrice: 7, checked: true, sortOrder: 1 },
    { name: "Apples", quantity: 6, unit: "pcs", category: "PRODUCE" as const, estPrice: null, checked: false, sortOrder: 2 },
    { name: "Eggs", quantity: 1, unit: "tray", category: "DAIRY_EGGS" as const, estPrice: 14, checked: false, sortOrder: 0 },
  ];

  it("groups by aisle in shop order", () => {
    const groups = groupByCategory(items);
    expect(groups.map((g) => g.category)).toEqual(["PRODUCE", "DAIRY_EGGS"]);
    expect(groups[1].items.map((i) => i.name)).toEqual(["Eggs", "Milk"]);
  });

  it("writes a Markdown checklist", () => {
    const md = planToMarkdown({ title: "Week", currency: "MYR", items }, (c) => c, "en");
    expect(md).toContain("# Week");
    expect(md).toContain("- [x] Milk, 1 L (RM");
    expect(md).toContain("- [ ] Apples, 6 pcs\n");
    expect(formatMoney(12.5, "XYZ1", "en")).toBe("XYZ1 12.50");
  });
});

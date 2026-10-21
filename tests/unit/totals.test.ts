import { describe, expect, it } from "vitest";
import { kcalFromMacros, scaleItem, sumNutrients } from "@/lib/nutrition/totals";

const rice = { grams: 200, kcal: 260, proteinG: 5.4, carbsG: 56, fatG: 0.6, fiberG: 0.8, sugarG: 0.2, addedSugarG: 0, sodiumMg: 2 };
const chicken = { grams: 150, kcal: 248, proteinG: 46.5, carbsG: 0, fatG: 5.4, fiberG: 0, sugarG: 0, addedSugarG: 0, sodiumMg: 110 };

describe("sumNutrients", () => {
  it("sums items and ignores non-finite values", () => {
    const t = sumNutrients([rice, chicken, { kcal: Number.NaN }]);
    expect(t.kcal).toBe(508);
    expect(t.proteinG).toBe(51.9);
    expect(t.sodiumMg).toBe(112);
  });
  it("returns zeros for an empty meal", () => {
    expect(sumNutrients([]).kcal).toBe(0);
  });
});

describe("scaleItem", () => {
  it("scales nutrients proportionally to grams", () => {
    const half = scaleItem(rice, 100);
    expect(half.grams).toBe(100);
    expect(half.kcal).toBe(130);
    expect(half.carbsG).toBe(28);
  });
  it("handles zero-gram items without dividing by zero", () => {
    const z = scaleItem({ ...rice, grams: 0 }, 50);
    expect(z.grams).toBe(50);
    expect(z.kcal).toBe(260);
  });
});

it("kcalFromMacros uses 4/4/9", () => {
  expect(kcalFromMacros({ proteinG: 10, carbsG: 10, fatG: 10 })).toBe(170);
});

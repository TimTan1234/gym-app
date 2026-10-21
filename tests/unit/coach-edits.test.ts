import { describe, expect, it } from "vitest";
import { diffPlans, editMealItems, mealUnchanged, planEditStillValid, type ExistingItem, type PlanShape } from "@/lib/ai/coach-edits";

const item = (id: string, name: string, grams: number, kcal: number): ExistingItem => ({
  id, name, quantity: 1, unit: "plate", grams, kcal, proteinG: grams / 10, carbsG: grams / 5, fatG: grams / 20, fiberG: 1, sugarG: 1, sodiumMg: 100, confidence: 0.8, assumptions: null,
});

describe("editMealItems", () => {
  const items = [item("rice", "Rice", 250, 325), item("chicken", "Fried chicken", 150, 400)];

  it("rescales nutrients and quantity from the new grams", () => {
    const { items: out, unknownIds } = editMealItems(items, [{ itemId: "rice", newGrams: 150, remove: false }]);
    expect(unknownIds).toEqual([]);
    expect(out[0]).toMatchObject({ name: "Rice", grams: 150, kcal: 195, proteinG: 15, carbsG: 30, quantity: 0.6 });
    expect(out[1]).toMatchObject({ name: "Fried chicken", grams: 150, kcal: 400 });
    expect("id" in out[0]).toBe(false);
  });

  it("removes items and reports ids it doesn't know", () => {
    const { items: out, unknownIds } = editMealItems(items, [
      { itemId: "chicken", newGrams: null, remove: true },
      { itemId: "nope", newGrams: 10, remove: false },
    ]);
    expect(out.map((i) => i.name)).toEqual(["Rice"]);
    expect(unknownIds).toEqual(["nope"]);
  });
});

const ex = (id: string, sets = 3, repMin = 8, repMax = 12) => ({
  exerciseId: id, exerciseName: id.toUpperCase(), exerciseSlug: id, sets, repMin, repMax, restSec: 90, targetRpe: 8,
});

describe("diffPlans", () => {
  const before: PlanShape = { days: [{ name: "Lower A", exercises: [ex("squat", 4, 5, 8), ex("rdl")] }, { name: "Upper A", exercises: [ex("bench")] }] };

  it("reports a swap as a removal plus an addition", () => {
    const after: PlanShape = { days: [{ name: "Lower A", exercises: [ex("leg-press", 4, 8, 12), ex("rdl")] }, before.days[1]] };
    expect(diffPlans(before, after)).toEqual([
      { type: "exerciseRemoved", day: "Lower A", slug: "squat", name: "SQUAT" },
      { type: "exerciseAdded", day: "Lower A", slug: "leg-press", name: "LEG-PRESS", sets: 4, repMin: 8, repMax: 12, restSec: 90, targetRpe: 8 },
    ]);
  });

  it("reports changed prescriptions, renames and removed days", () => {
    const after: PlanShape = { days: [{ name: "Legs", exercises: [ex("squat", 5, 5, 8), ex("rdl")] }] };
    expect(diffPlans(before, after)).toEqual([
      { type: "dayRenamed", from: "Lower A", to: "Legs" },
      { type: "exerciseChanged", day: "Legs", slug: "squat", name: "SQUAT", from: { sets: 4, repMin: 5, repMax: 8, restSec: 90, targetRpe: 8 }, to: { sets: 5, repMin: 5, repMax: 8, restSec: 90, targetRpe: 8 } },
      { type: "dayRemoved", day: "Upper A" },
    ]);
  });

  it("is empty when nothing changed", () => {
    expect(diffPlans(before, structuredClone(before))).toEqual([]);
  });
});

describe("stale edit cards", () => {
  it("a plan edit is valid only while the plan is as it was proposed", () => {
    const base: PlanShape = { days: [{ name: "Upper A", exercises: [ex("bench"), ex("row")] }] };
    const proposed: PlanShape = { days: [{ name: "Upper A", exercises: [ex("db-bench"), ex("row")] }] };
    // As read back from jsonb, which reorders object keys
    const reorder = (v: unknown): unknown =>
      Array.isArray(v) ? v.map(reorder) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reorder(x)])) : v;
    const changes = reorder(diffPlans(base, proposed)) as ReturnType<typeof diffPlans>;
    expect(planEditStillValid(base, proposed, changes)).toBe(true);
    // Another edit landed first: rows went to 4 sets
    const moved: PlanShape = { days: [{ name: "Upper A", exercises: [ex("bench"), ex("row", 4)] }] };
    expect(planEditStillValid(moved, proposed, changes)).toBe(false);
  });

  it("a meal edit is valid only while the meal is unchanged, in any item order", () => {
    const before = { localDate: "2026-10-21", mealType: "LUNCH", kcal: 660.2, items: [{ name: "Rice", grams: 200 }, { name: "Chicken", grams: 130 }] };
    expect(mealUnchanged(before, { ...before, kcal: 660, items: [...before.items].reverse() })).toBe(true);
    expect(mealUnchanged(before, { ...before, items: [{ name: "Rice", grams: 150 }, { name: "Chicken", grams: 130 }] })).toBe(false);
    expect(mealUnchanged(before, { ...before, mealType: "DINNER" })).toBe(false);
  });
});

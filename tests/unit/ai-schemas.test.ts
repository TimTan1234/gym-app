import { describe, expect, it } from "vitest";
import { MealAnalysisSchema, MealSaveSchema, planDraftSchema } from "@/lib/ai/schemas";
import { filterByEquipment, resolvePlanDraft } from "@/lib/ai/plan";
import mealFixture from "@/lib/ai/fixtures/meal.json";
import planFixture from "@/lib/ai/fixtures/plan.json";
import { EXERCISES } from "../../prisma/seed/exercises";

const slugs = EXERCISES.map((e) => e.slug) as [string, ...string[]];
const library = EXERCISES.map((e, i) => ({ id: `ex${i}`, slug: e.slug, name: e.name }));

describe("meal analysis schema", () => {
  it("accepts the fixture", () => {
    const parsed = MealAnalysisSchema.parse(mealFixture);
    expect(parsed.items.length).toBeGreaterThan(0);
  });
  it("rejects negative nutrients and missing fields", () => {
    const bad = structuredClone(mealFixture);
    bad.items[0].kcal = -5;
    expect(MealAnalysisSchema.safeParse(bad).success).toBe(false);
    const { title: _title, ...missing } = mealFixture;
    expect(MealAnalysisSchema.safeParse(missing).success).toBe(false);
  });
  it("validates the save payload", () => {
    const ok = MealSaveSchema.safeParse({
      mealType: "LUNCH",
      description: "Nasi lemak",
      source: "AI_TEXT",
      eatenAt: new Date().toISOString(),
      items: mealFixture.items,
    });
    expect(ok.success).toBe(true);
    expect(MealSaveSchema.safeParse({ mealType: "LUNCH", description: "x", source: "AI_TEXT", eatenAt: "now", items: [] }).success).toBe(false);
  });
  it("keeps added sugar within total sugar and defaults it for older drafts", () => {
    const save = (item: object) =>
      MealSaveSchema.parse({ mealType: "SNACK", description: "x", source: "MANUAL", eatenAt: new Date().toISOString(), items: [{ ...mealFixture.items[2], ...item }] }).items[0];
    expect(save({ sugarG: 4, addedSugarG: 9 }).addedSugarG).toBe(4);
    const { addedSugarG: _a, ...older } = mealFixture.items[2];
    expect(MealSaveSchema.parse({ mealType: "SNACK", description: "x", source: "MANUAL", eatenAt: new Date().toISOString(), items: [older] }).items[0].addedSugarG).toBe(0);
  });
});

describe("plan draft", () => {
  it("accepts the fixture and resolves exercise ids", () => {
    const draft = planDraftSchema(slugs).parse(planFixture);
    const resolved = resolvePlanDraft(draft, library);
    expect(resolved.days).toHaveLength(4);
    expect(resolved.days[0].exercises[0].exerciseId).toBe(library.find((e) => e.slug === "barbell-bench-press")!.id);
  });
  it("rejects exercises outside the allowed enum", () => {
    const bad = structuredClone(planFixture);
    bad.days[0].exercises[0].exerciseSlug = "made-up-machine-press";
    expect(planDraftSchema(slugs).safeParse(bad).success).toBe(false);
  });
  it("throws when a slug is missing from the library", () => {
    const draft = planDraftSchema(slugs).parse(planFixture);
    expect(() => resolvePlanDraft(draft, library.filter((e) => e.slug !== "deadlift"))).toThrow(/deadlift/);
  });
  it("swaps inverted rep ranges", () => {
    const draft = planDraftSchema(slugs).parse(planFixture);
    draft.days[0].exercises[0].repMin = 12;
    draft.days[0].exercises[0].repMax = 8;
    const ex = resolvePlanDraft(draft, library).days[0].exercises[0];
    expect([ex.repMin, ex.repMax]).toEqual([8, 12]);
  });
  it("filters by equipment and always allows bodyweight", () => {
    const res = filterByEquipment(EXERCISES, ["dumbbell"]);
    expect(res.every((e) => e.equipment === "dumbbell" || e.equipment === "bodyweight")).toBe(true);
    expect(res.some((e) => e.slug === "push-up")).toBe(true);
  });
});

describe("maxWorkingSets", () => {
  it("budgets ~2.5 min per working set with a sane minimum", async () => {
    const { maxWorkingSets } = await import("@/lib/ai/plan");
    expect(maxWorkingSets(45)).toBe(18);
    expect(maxWorkingSets(60)).toBe(24);
    expect(maxWorkingSets(10)).toBe(6);
  });
});

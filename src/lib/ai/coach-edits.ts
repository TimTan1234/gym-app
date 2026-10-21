// Coach edit proposals: tool parameter schemas and the pure logic behind them.
// No server-only imports, so unit tests can exercise all of it.

import { z } from "zod";
import { scaleItem, type Nutrients } from "@/lib/nutrition/totals";

const MealTypeEnum = z.enum(["BREAKFAST", "LUNCH", "DINNER", "SNACK"]);
const DateString = z.string().describe("Local date YYYY-MM-DD (today's date is in the instructions)");
const Reason = z.string().describe("One short sentence telling the user why");

export const GetMealsParams = z.object({ date: DateString });

export const MealLogParams = z.object({
  description: z.string().describe("What was eaten, with quantities as the user said them, e.g. '1 plate nasi lemak with fried chicken'"),
  mealType: MealTypeEnum,
  date: DateString,
  reason: Reason,
});

export const MealUpdateParams = z.object({
  mealId: z.string().describe("Meal id from get_meals"),
  changes: z
    .array(
      z.object({
        itemId: z.string().describe("Item id from get_meals"),
        newGrams: z.number().positive().nullable().describe("New edible weight in grams, or null to keep it"),
        remove: z.boolean().describe("true to remove this item from the meal"),
      }),
    )
    .describe("Edits to existing items; nutrients are rescaled from the grams on the server"),
  addDescription: z.string().nullable().describe("Food to add to this meal, described with quantities, or null"),
  mealType: MealTypeEnum.nullable().describe("Move the meal to another meal type, or null to keep it"),
  reason: Reason,
});

export const MealDeleteParams = z.object({ mealId: z.string().describe("Meal id from get_meals"), reason: Reason });

// ---------- Meal edits ----------

export interface ItemValues extends Nutrients {
  name: string;
  quantity: number;
  unit: string;
  grams: number;
  confidence: number | null;
  assumptions: string | null;
}

export type ExistingItem = ItemValues & { id: string };

/**
 * Apply grams changes and removals to a meal's items. Nutrients scale with
 * the grams, so the coach never has to restate (or invent) nutrition values.
 * Unknown item ids are reported so the model can correct itself.
 */
export function editMealItems(
  items: ExistingItem[],
  changes: z.infer<typeof MealUpdateParams>["changes"],
): { items: ItemValues[]; unknownIds: string[] } {
  const byId = new Map(changes.map((c) => [c.itemId, c]));
  const known = new Set(items.map((i) => i.id));
  const unknownIds = changes.map((c) => c.itemId).filter((id) => !known.has(id));
  const out: ItemValues[] = [];
  for (const { id: _id, ...item } of items) {
    const change = byId.get(_id);
    if (change?.remove) continue;
    if (change?.newGrams && item.grams > 0 && Math.abs(change.newGrams - item.grams) > 0.01) {
      // A new weight also changes the quantity in proportion ("2 pieces" → "1 piece").
      const scaled = scaleItem(item, change.newGrams);
      out.push({ ...scaled, quantity: Math.round(item.quantity * (change.newGrams / item.grams) * 100) / 100 });
    } else out.push(item);
  }
  return { items: out, unknownIds };
}

// ---------- Plan edits ----------

export interface PlanExerciseShape {
  exerciseId: string;
  exerciseName: string;
  exerciseSlug: string;
  sets: number;
  repMin: number;
  repMax: number;
  restSec: number;
  targetRpe: number | null;
}

export interface PlanShape {
  days: { name: string; exercises: PlanExerciseShape[] }[];
}

type ExerciseRef = { slug: string; name: string };
type Prescription = Pick<PlanExerciseShape, "sets" | "repMin" | "repMax" | "restSec" | "targetRpe">;

/** What a plan edit changes, as codes so the card can render it in any language. */
export type PlanChange =
  | { type: "dayAdded"; day: string }
  | { type: "dayRemoved"; day: string }
  | { type: "dayRenamed"; from: string; to: string }
  | ({ type: "exerciseAdded"; day: string } & ExerciseRef & Prescription)
  | ({ type: "exerciseRemoved"; day: string } & ExerciseRef)
  | ({ type: "exerciseChanged"; day: string; from: Prescription; to: Prescription } & ExerciseRef);

const prescription = (e: PlanExerciseShape): Prescription => ({
  sets: e.sets,
  repMin: e.repMin,
  repMax: e.repMax,
  restSec: e.restSec,
  targetRpe: e.targetRpe,
});

const samePrescription = (a: Prescription, b: Prescription) =>
  a.sets === b.sets && a.repMin === b.repMin && a.repMax === b.repMax && a.restSec === b.restSec && (a.targetRpe ?? null) === (b.targetRpe ?? null);

/** Days are matched by position (that is how plans are stored); exercises within a day by exercise. */
export function diffPlans(before: PlanShape, after: PlanShape): PlanChange[] {
  const changes: PlanChange[] = [];
  const n = Math.max(before.days.length, after.days.length);
  for (let i = 0; i < n; i++) {
    const a = before.days[i];
    const b = after.days[i];
    if (!a) {
      changes.push({ type: "dayAdded", day: b.name });
      for (const e of b.exercises) changes.push({ type: "exerciseAdded", day: b.name, slug: e.exerciseSlug, name: e.exerciseName, ...prescription(e) });
      continue;
    }
    if (!b) {
      changes.push({ type: "dayRemoved", day: a.name });
      continue;
    }
    if (a.name.trim() !== b.name.trim()) changes.push({ type: "dayRenamed", from: a.name, to: b.name });
    const beforeById = new Map(a.exercises.map((e) => [e.exerciseId, e]));
    const afterIds = new Set(b.exercises.map((e) => e.exerciseId));
    for (const e of a.exercises) {
      if (!afterIds.has(e.exerciseId)) changes.push({ type: "exerciseRemoved", day: b.name, slug: e.exerciseSlug, name: e.exerciseName });
    }
    for (const e of b.exercises) {
      const old = beforeById.get(e.exerciseId);
      if (!old) changes.push({ type: "exerciseAdded", day: b.name, slug: e.exerciseSlug, name: e.exerciseName, ...prescription(e) });
      else if (!samePrescription(prescription(old), prescription(e))) {
        changes.push({ type: "exerciseChanged", day: b.name, slug: e.exerciseSlug, name: e.exerciseName, from: prescription(old), to: prescription(e) });
      }
    }
  }
  return changes;
}

/** A stored plan's days (with their exercise rows) in the shape diffPlans compares. */
export function planShapeOf(
  days: { name: string; exercises: (Omit<PlanExerciseShape, "exerciseName" | "exerciseSlug"> & { exercise: { slug: string; name: string } })[] }[],
): PlanShape {
  return {
    days: days.map((d) => ({
      name: d.name,
      exercises: d.exercises.map((e) => ({
        exerciseId: e.exerciseId,
        exerciseName: e.exercise.name,
        exerciseSlug: e.exercise.slug,
        sets: e.sets,
        repMin: e.repMin,
        repMax: e.repMax,
        restSec: e.restSec,
        targetRpe: e.targetRpe,
      })),
    })),
  };
}

// ---------- Stale cards ----------
// Edit cards hold a full replacement built from the data as it was when the
// coach proposed it. If the meal or plan changed since (another card, or the
// user's own edits), applying the card would silently undo those changes.

/** JSON with object keys sorted: Postgres jsonb does not keep the order they were written in. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v,
  );
}

/** Whether the plan still differs from the proposal exactly as the card says. */
export function planEditStillValid(current: PlanShape, proposed: PlanShape, changes: PlanChange[]): boolean {
  return canonical(diffPlans(current, proposed)) === canonical(changes);
}

type MealFingerprint = { localDate: string; mealType: string; kcal: number; items: { name: string; grams: number }[] };
const fingerprint = (m: MealFingerprint) =>
  JSON.stringify([m.localDate, m.mealType, Math.round(m.kcal), m.items.map((i) => `${i.name}:${Math.round(i.grams)}`).sort()]);

/** Whether a meal still matches the snapshot an edit card was built from. */
export function mealUnchanged(before: MealFingerprint, now: MealFingerprint): boolean {
  return fingerprint(before) === fingerprint(now);
}

// The user's data as CSV tables, one per dataset. Values are as stored (metric), with the unit
// in each column name; times are ISO 8601 in UTC and dates the user's local YYYY-MM-DD.

import { toCsv } from "./csv";
import { nutriGrade, type DrinkFields } from "./nutrition/nutri-grade";

export const DATASETS = ["meals", "body", "workouts", "glucose"] as const;
export type Dataset = (typeof DATASETS)[number];

const NUTRIENTS = ["kcal", "proteinG", "carbsG", "fatG", "fiberG", "sugarG", "addedSugarG", "sodiumMg"] as const;
type Nutrients = Record<(typeof NUTRIENTS)[number], number>;

export interface MealRow extends Nutrients {
  localDate: string;
  eatenAt: Date;
  mealType: string;
  description: string;
  notes: string | null;
  items: (Nutrients & DrinkFields & { name: string; quantity: number; unit: string; grams: number; gi: number | null })[];
}

/** One row per food, with its meal's columns repeated; a meal without foods gets one row of its totals. */
export function mealsCsv(meals: MealRow[]): string {
  const header = [
    "date", "eaten_at", "meal_type", "description", "notes", "food", "quantity", "unit", "grams",
    "kcal", "protein_g", "carbs_g", "fat_g", "fiber_g", "sugar_g", "added_sugar_g", "sodium_mg", "gi",
    "saturated_fat_g", "volume_ml", "sweetener", "nutri_grade",
  ];
  const rows = meals.flatMap((m) => {
    const meal = [m.localDate, m.eatenAt, m.mealType, m.description, m.notes];
    if (m.items.length === 0) return [[...meal, null, null, null, null, ...NUTRIENTS.map((k) => m[k]), null, null, null, null, null]];
    const drink = (i: MealRow["items"][number]) => [i.saturatedFatG, i.volumeMl, i.sweetener, nutriGrade(i)?.grade ?? null];
    return m.items.map((i) => [...meal, i.name, i.quantity, i.unit, i.grams, ...NUTRIENTS.map((k) => i[k]), i.gi, ...drink(i)]);
  });
  return toCsv(header, rows);
}

export function bodyCsv(metrics: { localDate: string; weightKg: number; bodyFatPct: number | null; bodyFatSource: string | null; waistCm: number | null }[]): string {
  return toCsv(
    ["date", "weight_kg", "body_fat_pct", "body_fat_source", "waist_cm"],
    metrics.map((m) => [m.localDate, m.weightKg, m.bodyFatPct, m.bodyFatSource, m.waistCm]),
  );
}

export interface WorkoutRow {
  localDate: string;
  startedAt: Date;
  endedAt: Date | null;
  name: string | null;
  notes: string | null;
  sets: {
    exercise: string;
    setIndex: number;
    isWarmup: boolean;
    weightKg: number;
    reps: number;
    rpe: number | null;
    durationSec: number | null;
    distanceM: number | null;
  }[];
}

/** One row per set. Cardio sets have a duration and distance, and 0 weight and reps. */
export function workoutsCsv(workouts: WorkoutRow[]): string {
  const header = ["date", "started_at", "ended_at", "workout", "notes", "exercise", "set", "warmup", "weight_kg", "reps", "rpe", "duration_sec", "distance_m"];
  const rows = workouts.flatMap((w) =>
    w.sets.map((s) => [w.localDate, w.startedAt, w.endedAt, w.name, w.notes, s.exercise, s.setIndex, s.isWarmup, s.weightKg, s.reps, s.rpe, s.durationSec, s.distanceM]),
  );
  return toCsv(header, rows);
}

export function glucoseCsv(readings: { localDate: string; measuredAt: Date; mmol: number; context: string; note: string | null }[]): string {
  return toCsv(
    ["date", "measured_at", "glucose_mmol_l", "context", "note"],
    readings.map((r) => [r.localDate, r.measuredAt, r.mmol, r.context, r.note]),
  );
}

// Nutrient totals. Meal totals are always derived from items here, never
// taken from AI output.

export const NUTRIENT_KEYS = [
  "kcal",
  "proteinG",
  "carbsG",
  "fatG",
  "fiberG",
  "sugarG",
  "addedSugarG",
  "sodiumMg",
] as const;

export type NutrientKey = (typeof NUTRIENT_KEYS)[number];
export type Nutrients = Record<NutrientKey, number>;

export const ZERO_NUTRIENTS: Nutrients = {
  kcal: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
  fiberG: 0,
  sugarG: 0,
  addedSugarG: 0,
  sodiumMg: 0,
};

export function sumNutrients(items: readonly Partial<Nutrients>[]): Nutrients {
  const total = { ...ZERO_NUTRIENTS };
  for (const item of items) {
    for (const key of NUTRIENT_KEYS) {
      const v = item[key];
      if (typeof v === "number" && Number.isFinite(v)) total[key] += v;
    }
  }
  for (const key of NUTRIENT_KEYS) total[key] = Math.round(total[key] * 10) / 10;
  return total;
}

/** Scale an item's nutrients when the user changes its gram weight. */
export function scaleItem<T extends Nutrients & { grams: number }>(item: T, newGrams: number): T {
  if (item.grams <= 0 || newGrams < 0) return { ...item, grams: Math.max(0, newGrams) };
  const factor = newGrams / item.grams;
  const scaled = { ...item, grams: newGrams };
  for (const key of NUTRIENT_KEYS) scaled[key] = Math.round(item[key] * factor * 10) / 10;
  return scaled;
}

/** Calories implied by macros (4/4/9). Used to sanity-check AI output. */
export function kcalFromMacros(n: Pick<Nutrients, "proteinG" | "carbsG" | "fatG">): number {
  return n.proteinG * 4 + n.carbsG * 4 + n.fatG * 9;
}

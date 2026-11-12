// Singapore's Nutri-Grade for beverages (Food Regulations reg. 184B), graded on sugar and saturated
// fat per 100 ml. Rounding and thresholds follow HPB's Nutri-Grade calculator: sugar to 1 decimal place,
// saturated fat to 2, each grade's upper limit inclusive; the beverage takes the worse of the two
// grades, and a non-sugar sweetener moves a sugar grade of A to B (so a sweetened drink is never A).

export type NutriGrade = "A" | "B" | "C" | "D";

export const GRADES: readonly NutriGrade[] = ["A", "B", "C", "D"];
/** Upper limits, g per 100 ml, of grades A, B and C. */
const SUGAR_LIMITS = [1, 5, 10];
const SATURATED_FAT_LIMITS = [0.7, 1.2, 2.8];

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;
const gradeOf = (per100: number, limits: number[]) => GRADES[limits.filter((limit) => per100 > limit).length];

export interface DrinkNutrition {
  /** Total sugar in the whole quantity, g. */
  sugarG: number;
  /** Saturated fat in the whole quantity, g; null when unknown. */
  saturatedFatG: number | null;
  /** Null when the item isn't a drink. */
  volumeMl: number | null;
  sweetener: boolean;
}

/** A drink's Nutri-Grade fields on a meal item or saved food. */
export type DrinkFields = Omit<DrinkNutrition, "sugarG">;

export interface Graded {
  grade: NutriGrade;
  /** The graded values, rounded as HPB rounds them. */
  sugarPer100Ml: number;
  saturatedFatPer100Ml: number;
  /** What set the grade: the worse of the two values, both when they grade alike, or the sweetener rule lifting an A. */
  decidedBy: "sugar" | "saturatedFat" | "both" | "sweetener";
}

/** The grade and what it rests on, or null for food or a drink missing a value. */
export function nutriGrade({ sugarG, saturatedFatG, volumeMl, sweetener }: DrinkNutrition): Graded | null {
  if (volumeMl === null || !(volumeMl > 0) || saturatedFatG === null) return null;
  const sugarPer100Ml = round((sugarG / volumeMl) * 100, 1);
  const saturatedFatPer100Ml = round((saturatedFatG / volumeMl) * 100, 2);
  const bySugar = gradeOf(sugarPer100Ml, SUGAR_LIMITS);
  const bySaturatedFat = gradeOf(saturatedFatPer100Ml, SATURATED_FAT_LIMITS);
  const values = { sugarPer100Ml, saturatedFatPer100Ml };
  // Letters sort in grade order, A best.
  if (sweetener && bySugar === "A" && bySaturatedFat === "A") return { grade: "B", ...values, decidedBy: "sweetener" };
  if (bySugar === bySaturatedFat) return { grade: bySugar, ...values, decidedBy: "both" };
  return bySugar > bySaturatedFat ? { grade: bySugar, ...values, decidedBy: "sugar" } : { grade: bySaturatedFat, ...values, decidedBy: "saturatedFat" };
}

/** The worst-graded drink among items, for a meal's row. */
export function worstDrink<T extends DrinkNutrition>(items: readonly T[]): { item: T; grade: NutriGrade } | null {
  let worst: { item: T; grade: NutriGrade } | null = null;
  for (const item of items) {
    const graded = nutriGrade(item);
    if (graded && (!worst || graded.grade > worst.grade)) worst = { item, grade: graded.grade };
  }
  return worst;
}

// Carbohydrate guidance for diabetes mode.
//
// Source: Malaysian CPG Management of T2DM, 6th ed. (2020), section 3.5:
//  - Table 3-7: carbohydrate exchanges per meal — inactive women 2-4, active
//    women or inactive men 3-5, active men 4-6; snacks 1-2. One exchange is 15 g.
//  - At least 130 g of carbohydrate a day; 45-60% of energy from carbohydrate,
//    25-35% from fat.
//  - Appendix 4: glycaemic index low (<55), intermediate (56-70), high (>70).

import type { ActivityLevel, Sex } from "./targets";

export const CARB_EXCHANGE_G = 15;
export const MIN_DAILY_CARBS_G = 130;
export const MAX_FAT_SHARE = 0.35;

export interface CarbBudget {
  meal: { min: number; max: number };
  snack: { min: number; max: number };
  /** Three meals and one snack at the top of their ranges. */
  dailyMax: number;
}

const isActive = (level: ActivityLevel) => level === "MODERATE" || level === "ACTIVE" || level === "VERY_ACTIVE";

export function carbBudget(sex: Sex, activityLevel: ActivityLevel): CarbBudget {
  const active = isActive(activityLevel);
  const [lo, hi] = sex === "FEMALE" ? (active ? [3, 5] : [2, 4]) : active ? [4, 6] : [3, 5];
  const meal = { min: lo * CARB_EXCHANGE_G, max: hi * CARB_EXCHANGE_G };
  const snack = { min: CARB_EXCHANGE_G, max: 2 * CARB_EXCHANGE_G };
  return { meal, snack, dailyMax: Math.max(MIN_DAILY_CARBS_G, 3 * meal.max + snack.max) };
}

export type GiBand = "low" | "intermediate" | "high";

export function giBand(gi: number | null | undefined): GiBand | null {
  if (gi == null) return null;
  if (gi <= 55) return "low";
  if (gi <= 70) return "intermediate";
  return "high";
}

/** Share of a meal's carbs that come from high-GI foods, over items whose GI is known. */
export function highGiCarbShare(items: { carbsG: number; gi?: number | null }[]): { share: number; knownCarbs: number } | null {
  let known = 0;
  let high = 0;
  for (const i of items) {
    if (i.gi == null || i.carbsG <= 0) continue;
    known += i.carbsG;
    if (giBand(i.gi) === "high") high += i.carbsG;
  }
  return known > 0 ? { share: high / known, knownCarbs: known } : null;
}

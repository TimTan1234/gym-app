// Daily calorie and macro targets.
// BMR: Mifflin-St Jeor. TDEE: BMR × activity factor.
// Goal adjustment: ~7700 kcal per kg of body weight, spread over 7 days.

import { MAX_FAT_SHARE, MAX_PROTEIN_SHARE, MIN_DAILY_CARBS_G, MIN_PROTEIN_G_PER_KG, carbBudget } from "./diabetes";

export type Sex = "MALE" | "FEMALE";
export type ActivityLevel = "SEDENTARY" | "LIGHT" | "MODERATE" | "ACTIVE" | "VERY_ACTIVE";
export type Goal = "CUT" | "MAINTAIN" | "BULK";

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  SEDENTARY: 1.2,
  LIGHT: 1.375,
  MODERATE: 1.55,
  ACTIVE: 1.725,
  VERY_ACTIVE: 1.9,
};

/** Safety floors; targets are never set below these. */
export const KCAL_FLOOR: Record<Sex, number> = { MALE: 1500, FEMALE: 1200 };

const KCAL_PER_KG = 7700;
const MAX_DEFICIT = 1000;
const MAX_SURPLUS = 500;

export interface TargetInput {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goal: Goal;
  /** Desired weekly change in kg (positive number; direction comes from goal). */
  rateKgPerWeek: number;
  /** Diabetes mode: carbs and protein follow the CPG (see splitMacros). */
  diabetes?: boolean;
}

export interface Targets {
  bmr: number;
  tdee: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** True when the requested deficit was limited by the safety floor. */
  clampedToFloor: boolean;
}

export function bmrMifflin(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === "MALE" ? base + 5 : base - 161;
}

export function goalDelta(goal: Goal, rateKgPerWeek: number): number {
  const daily = (Math.abs(rateKgPerWeek) * KCAL_PER_KG) / 7;
  if (goal === "CUT") return -Math.min(daily, MAX_DEFICIT);
  if (goal === "BULK") return Math.min(daily, MAX_SURPLUS);
  return 0;
}

/** Protein in g per kg of body weight: higher when cutting to protect muscle. */
export function proteinPerKg(goal: Goal): number {
  return goal === "CUT" ? 2.2 : goal === "BULK" ? 1.8 : 2.0;
}

export function computeTargets(input: TargetInput): Targets {
  const bmr = bmrMifflin(input.sex, input.weightKg, input.heightCm, input.age);
  const tdee = bmr * ACTIVITY_FACTORS[input.activityLevel];
  const desired = tdee + goalDelta(input.goal, input.rateKgPerWeek);
  const floor = KCAL_FLOOR[input.sex];
  const kcal = Math.round(Math.max(desired, floor));

  const diabetes = input.diabetes ? { carbCapG: carbBudget(input.sex, input.activityLevel).dailyMax, weightKg: input.weightKg } : null;
  const { proteinG, carbsG, fatG } = splitMacros(kcal, Math.round(input.weightKg * proteinPerKg(input.goal)), diabetes);

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    kcal,
    proteinG,
    carbsG,
    fatG,
    clampedToFloor: desired < floor,
  };
}

/** Fat's usual share of kcal, and the guideline's minimum in diabetes mode. */
const FAT_SHARE = 0.25;

/** Diabetes mode's inputs to the macro split. */
export interface DiabetesSplit {
  /** Daily carb cap from the CPG meal budget. */
  carbCapG: number;
  weightKg: number;
}

/**
 * Fat 25% of kcal, carbs fill the rest.
 *
 * Diabetes mode follows the CPG (section 3.5):
 *  - protein at most 20% of kcal, but not under 0.8 g/kg;
 *  - carbs stop at the cap and fat takes the remainder up to 35% of kcal; past
 *    that, carbs take the rest again so the calories still add up;
 *  - carbs never under 130 g and fat never under 25%. When the calories can't
 *    fit those and the protein too (a cut near the calorie floor), protein gives way.
 */
export function splitMacros(
  kcal: number,
  proteinG: number,
  diabetes: DiabetesSplit | null = null,
): { proteinG: number; carbsG: number; fatG: number } {
  let fatG = Math.round((kcal * FAT_SHARE) / 9);
  if (diabetes) {
    const capG = Math.max(Math.round((kcal * MAX_PROTEIN_SHARE) / 4), Math.round(diabetes.weightKg * MIN_PROTEIN_G_PER_KG));
    const roomG = Math.floor((kcal - MIN_DAILY_CARBS_G * 4 - fatG * 9) / 4);
    proteinG = Math.max(0, Math.min(proteinG, capG, roomG));
  }
  const rest = Math.max(0, kcal - proteinG * 4);
  let carbsG = Math.max(0, Math.round((rest - fatG * 9) / 4));
  if (diabetes && carbsG > diabetes.carbCapG) {
    carbsG = Math.max(diabetes.carbCapG, MIN_DAILY_CARBS_G);
    fatG = Math.round((rest - carbsG * 4) / 9);
    const maxFatG = Math.round((kcal * MAX_FAT_SHARE) / 9);
    if (fatG > maxFatG) {
      fatG = maxFatG;
      carbsG = Math.round((rest - fatG * 9) / 4);
    }
  }
  return { proteinG, carbsG, fatG };
}

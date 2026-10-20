// Daily calorie and macro targets.
// BMR: Mifflin-St Jeor. TDEE: BMR × activity factor.
// Goal adjustment: ~7700 kcal per kg of body weight, spread over 7 days.

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

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  SEDENTARY: "Sedentary (desk job, little exercise)",
  LIGHT: "Light (1–3 workouts/week)",
  MODERATE: "Moderate (3–5 workouts/week)",
  ACTIVE: "Active (6–7 workouts/week)",
  VERY_ACTIVE: "Very active (physical job + training)",
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

  const proteinG = Math.round(input.weightKg * proteinPerKg(input.goal));
  const fatG = Math.round((kcal * 0.25) / 9);
  const carbKcal = kcal - proteinG * 4 - fatG * 9;
  const carbsG = Math.max(0, Math.round(carbKcal / 4));

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

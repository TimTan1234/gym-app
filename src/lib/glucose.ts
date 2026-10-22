// Blood glucose for diabetes mode (Type 2 and prediabetes). Pure, so the
// thresholds can be unit-tested. Values are mmol/L throughout; mg/dL is display only.
//
// Sources:
//  - Malaysian CPG Management of T2DM, 6th ed. (2020), Table 3-5: fasting or
//    pre-prandial 4.4-7.0 mmol/L; post-prandial 4.4-8.5 mmol/L, measured at
//    least 90 minutes after a meal.
//  - Same CPG, section 4.1 (Tables 4-1, 4-2): hypoglycaemia <3.9 mmol/L
//    (level 1), <3.0 mmol/L (level 2), treated with 15 g of simple carbohydrate
//    and a recheck after 15 minutes.
//  - Same CPG, Appendix 5: before exercise, take extra carbohydrate if glucose is
//    <5.6 mmol/L; may not be needed for those not on insulin or secretagogues.
//  - VERY_HIGH (16.7 mmol/L, 300 mg/dL) is a common patient-education threshold,
//    not a CPG figure.

export type GlucoseUnit = "MMOL_L" | "MG_DL";
export type GlucoseContext = "FASTING" | "BEFORE_MEAL" | "AFTER_MEAL" | "BEDTIME" | "BEFORE_EXERCISE" | "OTHER";

export const GLUCOSE_CONTEXTS: GlucoseContext[] = ["FASTING", "BEFORE_MEAL", "AFTER_MEAL", "BEDTIME", "BEFORE_EXERCISE", "OTHER"];

export const MGDL_PER_MMOL = 18;

/** Readings outside this are almost certainly typos; the server rejects them. */
export const MIN_MMOL = 1;
export const MAX_MMOL = 35;

export const HYPO_MMOL = 3.9;
export const SEVERE_HYPO_MMOL = 3.0;
export const VERY_HIGH_MMOL = 16.7;
export const PRE_EXERCISE_LOW_MMOL = 5.6;
/** The CPG's post-prandial target applies from 90 minutes after a meal. */
export const POST_MEAL_MIN_MINUTES = 90;

export interface GlucoseTargets {
  fastingMin: number;
  fastingMax: number;
  postMealMax: number;
}

export const DEFAULT_GLUCOSE_TARGETS: GlucoseTargets = { fastingMin: 4.4, fastingMax: 7.0, postMealMax: 8.5 };

export function toDisplay(mmol: number, unit: GlucoseUnit): number {
  return unit === "MG_DL" ? Math.round(mmol * MGDL_PER_MMOL) : Math.round(mmol * 10) / 10;
}

export function toMmol(value: number, unit: GlucoseUnit): number {
  return unit === "MG_DL" ? Math.round((value / MGDL_PER_MMOL) * 100) / 100 : value;
}

export const unitLabel = (unit: GlucoseUnit) => (unit === "MG_DL" ? "mg/dL" : "mmol/L");

/** The target range for a reading taken in this context. */
export function rangeFor(context: GlucoseContext, targets: GlucoseTargets): { min: number; max: number } {
  // Fasting, pre-meal and pre-exercise readings use the fasting range; readings
  // that may follow food (after a meal, bedtime, other) use the post-prandial one.
  const fastingLike = context === "FASTING" || context === "BEFORE_MEAL" || context === "BEFORE_EXERCISE";
  return { min: targets.fastingMin, max: fastingLike ? targets.fastingMax : targets.postMealMax };
}

/**
 * - severeLow / low: hypoglycaemia (level 2 / level 1), whatever the context.
 * - early: an after-meal reading under 90 minutes after eating, which the
 *   post-prandial target doesn't apply to yet.
 */
export type GlucoseStatus = "severeLow" | "low" | "inTarget" | "above" | "veryHigh" | "early";

export function classifyReading(
  reading: { mmol: number; context: GlucoseContext; minutesAfterMeal?: number | null },
  targets: GlucoseTargets,
): GlucoseStatus {
  if (reading.mmol < SEVERE_HYPO_MMOL) return "severeLow";
  if (reading.mmol < HYPO_MMOL) return "low";
  if (reading.mmol >= VERY_HIGH_MMOL) return "veryHigh";
  if (reading.context === "AFTER_MEAL" && reading.minutesAfterMeal != null && reading.minutesAfterMeal < POST_MEAL_MIN_MINUTES) return "early";
  const { min, max } = rangeFor(reading.context, targets);
  return reading.mmol >= min && reading.mmol <= max ? "inTarget" : "above";
}

export interface ReadingSummary {
  count: number;
  /** Readings judged against a target (excludes "early"). */
  rated: number;
  inTarget: number;
  low: number;
  above: number;
}

/** "Readings in target", not "time in range": occasional finger-pricks are not a CGM trace. */
export function summarize(statuses: GlucoseStatus[]): ReadingSummary {
  const s = { count: statuses.length, rated: 0, inTarget: 0, low: 0, above: 0 };
  for (const status of statuses) {
    if (status === "early") continue;
    s.rated++;
    if (status === "inTarget") s.inTarget++;
    else if (status === "low" || status === "severeLow") s.low++;
    else s.above++;
  }
  return s;
}

/** What to say before a workout, from the most recent reading. */
export type PreExerciseAdvice = "checkFirst" | "eatFirst" | "low" | "veryHigh" | "ok" | null;

/** Readings older than this don't describe "now". */
export const RECENT_READING_MINUTES = 60;

export function preExerciseAdvice(
  last: { mmol: number; minutesAgo: number } | null,
  hypoRiskMeds: boolean,
): PreExerciseAdvice {
  const recent = last && last.minutesAgo <= RECENT_READING_MINUTES ? last : null;
  if (!recent) return hypoRiskMeds ? "checkFirst" : null;
  if (recent.mmol < HYPO_MMOL) return "low";
  if (recent.mmol >= VERY_HIGH_MMOL) return "veryHigh";
  if (hypoRiskMeds && recent.mmol < PRE_EXERCISE_LOW_MMOL) return "eatFirst";
  return "ok";
}

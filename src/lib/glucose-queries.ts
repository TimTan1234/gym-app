import "server-only";
import { db } from "./db";
import { addDays, toLocalTime } from "./dates";
import { POST_MEAL_MIN_MINUTES, classifyReading, type GlucoseStatus, type GlucoseTargets } from "./glucose";

export interface GlucoseProfile {
  timezone: string;
  glucoseFastingMin: number;
  glucoseFastingMax: number;
  glucosePostMealMax: number;
}

export const targetsOf = (p: GlucoseProfile): GlucoseTargets => ({
  fastingMin: p.glucoseFastingMin,
  fastingMax: p.glucoseFastingMax,
  postMealMax: p.glucosePostMealMax,
});

const minutesBetween = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / 60000);

export interface AfterMealReading {
  mmol: number;
  minutesAfter: number;
  status: GlucoseStatus;
}

/** After-meal readings linked to these meals, keyed by meal id. */
export async function afterMealReadings(userId: string, meals: { id: string; eatenAt: Date }[], profile: GlucoseProfile) {
  const readings = await db.glucoseReading.findMany({
    where: { userId, context: "AFTER_MEAL", mealId: { in: meals.map((m) => m.id) } },
    orderBy: { measuredAt: "asc" },
  });
  const eaten = new Map(meals.map((m) => [m.id, m.eatenAt]));
  const byMeal = new Map<string, AfterMealReading[]>();
  for (const r of readings) {
    const minutesAfter = minutesBetween(eaten.get(r.mealId!)!, r.measuredAt);
    const list = byMeal.get(r.mealId!) ?? [];
    list.push({ mmol: r.mmol, minutesAfter, status: classifyReading({ mmol: r.mmol, context: "AFTER_MEAL", minutesAfterMeal: minutesAfter }, targetsOf(profile)) });
    byMeal.set(r.mealId!, list);
  }
  return byMeal;
}

/** Ask for an after-meal reading from 90 minutes after eating, for a few hours. */
const PROMPT_UNTIL_MINUTES = 4 * 60;

/**
 * Today's most recent meal that is due an after-meal check: eaten 90 minutes to
 * 4 hours ago, with no reading linked to it yet.
 */
export async function mealDueForCheck(userId: string, today: string, profile: GlucoseProfile, now = new Date()) {
  const meals = await db.meal.findMany({
    where: {
      userId,
      localDate: today,
      eatenAt: { lte: new Date(now.getTime() - POST_MEAL_MIN_MINUTES * 60000), gte: new Date(now.getTime() - PROMPT_UNTIL_MINUTES * 60000) },
      glucoseReadings: { none: { context: "AFTER_MEAL" } },
    },
    orderBy: { eatenAt: "desc" },
    take: 1,
    select: { id: true, description: true, eatenAt: true },
  });
  const meal = meals[0];
  return meal ? { id: meal.id, description: meal.description, time: toLocalTime(meal.eatenAt, profile.timezone) } : null;
}

/** A reading this long before a meal counts as its "before" value. */
const BEFORE_MEAL_WINDOW_MS = 60 * 60000;

export interface MealResponse {
  mealId: string;
  description: string;
  localDate: string;
  carbsG: number;
  /** A reading taken in the hour before the meal, if any. */
  beforeMmol: number | null;
  afterMmol: number;
  minutesAfter: number;
  status: GlucoseStatus;
  items: { carbsG: number; gi: number | null }[];
}

/** Meals with an after-meal reading in the window, highest reading first. */
export async function mealResponses(userId: string, sinceDate: string, profile: GlucoseProfile): Promise<MealResponse[]> {
  const [after, beforeCandidates] = await Promise.all([
    db.glucoseReading.findMany({
      where: { userId, context: "AFTER_MEAL", localDate: { gte: sinceDate }, mealId: { not: null } },
      orderBy: { measuredAt: "desc" },
      include: { meal: { select: { id: true, description: true, localDate: true, eatenAt: true, carbsG: true, items: { select: { carbsG: true, gi: true } } } } },
    }),
    db.glucoseReading.findMany({
      where: { userId, context: { in: ["BEFORE_MEAL", "FASTING"] }, localDate: { gte: addDays(sinceDate, -1) } },
      orderBy: { measuredAt: "desc" },
      select: { mmol: true, measuredAt: true },
    }),
  ]);
  const seen = new Set<string>();
  const responses: MealResponse[] = [];
  for (const r of after) {
    // One row per meal: its latest after-meal reading.
    if (!r.meal || seen.has(r.meal.id)) continue;
    seen.add(r.meal.id);
    const eaten = r.meal.eatenAt.getTime();
    const before = beforeCandidates.find((b) => b.measuredAt.getTime() <= eaten && b.measuredAt.getTime() >= eaten - BEFORE_MEAL_WINDOW_MS);
    const minutesAfter = minutesBetween(r.meal.eatenAt, r.measuredAt);
    responses.push({
      mealId: r.meal.id,
      description: r.meal.description,
      localDate: r.meal.localDate,
      carbsG: r.meal.carbsG,
      beforeMmol: before?.mmol ?? null,
      afterMmol: r.mmol,
      minutesAfter,
      status: classifyReading({ mmol: r.mmol, context: "AFTER_MEAL", minutesAfterMeal: minutesAfter }, targetsOf(profile)),
      items: r.meal.items,
    });
  }
  return responses.sort((a, b) => b.afterMmol - a.afterMmol);
}

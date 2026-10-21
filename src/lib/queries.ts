import "server-only";
import { db } from "./db";
import { sumNutrients } from "./nutrition/totals";
import { addDays, todayLocal } from "./dates";
import { CHECKIN_DAYS, weeklyCheckin } from "./nutrition/checkin";
import type { Goal, Sex } from "./nutrition/targets";

export async function getDayNutrition(userId: string, localDate: string) {
  const meals = await db.meal.findMany({
    where: { userId, localDate },
    include: { items: { orderBy: { id: "asc" } } },
    orderBy: { eatenAt: "asc" },
  });
  return { meals, totals: sumNutrients(meals) };
}

export async function getLatestWeight(userId: string) {
  return db.bodyMetric.findFirst({ where: { userId }, orderBy: { localDate: "desc" } });
}

export async function getActivePlan(userId: string) {
  return db.trainingPlan.findFirst({
    where: { userId, isActive: true },
    include: {
      days: {
        orderBy: { dayIndex: "asc" },
        include: { exercises: { orderBy: { order: "asc" }, include: { exercise: true } } },
      },
    },
  });
}

/** Next plan day = the one after the most recently trained day of this plan. */
export async function getNextPlanDay(userId: string) {
  const plan = await getActivePlan(userId);
  if (!plan || plan.days.length === 0) return null;
  const last = await db.workoutSession.findFirst({
    where: { userId, planDay: { planId: plan.id } },
    orderBy: { startedAt: "desc" },
    select: { planDay: { select: { dayIndex: true } } },
  });
  const lastIndex = last?.planDay?.dayIndex ?? -1;
  const next = plan.days.find((d) => d.dayIndex > lastIndex) ?? plan.days[0];
  return { plan, day: next };
}

export async function getActiveWorkout(userId: string) {
  return db.workoutSession.findFirst({ where: { userId, endedAt: null }, orderBy: { startedAt: "desc" } });
}

export interface PrevSet {
  weightKg: number;
  reps: number;
  isWarmup: boolean;
}

/** Sets from the most recent *other* finished session, per exercise. */
export async function lastSessionSets(userId: string, exerciseIds: string[], excludeSessionId?: string) {
  const out = new Map<string, { date: string; sets: PrevSet[] }>();
  if (exerciseIds.length === 0) return out;
  const rows = await db.workoutSet.findMany({
    where: {
      exerciseId: { in: exerciseIds },
      session: { userId, endedAt: { not: null }, ...(excludeSessionId ? { id: { not: excludeSessionId } } : {}) },
    },
    orderBy: [{ completedAt: "desc" }],
    take: 400,
    select: { exerciseId: true, sessionId: true, weightKg: true, reps: true, isWarmup: true, setIndex: true, session: { select: { localDate: true } } },
  });
  // Rows are newest first, so the first session seen per exercise is the latest.
  const latestSession = new Map<string, string>();
  const grouped = new Map<string, { date: string; rows: typeof rows }>();
  for (const r of rows) {
    if (!latestSession.has(r.exerciseId)) latestSession.set(r.exerciseId, r.sessionId);
    if (latestSession.get(r.exerciseId) !== r.sessionId) continue;
    const g = grouped.get(r.exerciseId) ?? { date: r.session.localDate, rows: [] };
    g.rows.push(r);
    grouped.set(r.exerciseId, g);
  }
  for (const [exerciseId, g] of grouped) {
    out.set(exerciseId, {
      date: g.date,
      sets: g.rows.sort((a, b) => a.setIndex - b.setIndex).map(({ weightKg, reps, isWarmup }) => ({ weightKg, reps, isWarmup })),
    });
  }
  return out;
}

/** Inputs for the weekly check-in, read for the last 14 full days. */
export async function getCheckin(
  userId: string,
  profile: {
    timezone: string;
    targetKcal: number;
    targetProteinG: number;
    goal: Goal;
    rateKgPerWeek: number;
    sex: Sex;
    targetsSetOn: string | null;
  },
) {
  const today = todayLocal(profile.timezone);
  const from = addDays(today, -(CHECKIN_DAYS + 7));
  const [days, weights] = await Promise.all([
    db.meal.groupBy({ by: ["localDate"], where: { userId, localDate: { gte: from, lt: today } }, _sum: { kcal: true } }),
    db.bodyMetric.findMany({ where: { userId, localDate: { gte: from, lt: today } }, select: { localDate: true, weightKg: true } }),
  ]);
  return weeklyCheckin({
    today,
    intake: days.map((d) => ({ date: d.localDate, kcal: d._sum.kcal ?? 0 })),
    weights: weights.map((w) => ({ date: w.localDate, weightKg: w.weightKg })),
    targetKcal: profile.targetKcal,
    proteinG: profile.targetProteinG,
    goal: profile.goal,
    rateKgPerWeek: profile.rateKgPerWeek,
    sex: profile.sex,
    targetsSetOn: profile.targetsSetOn,
  });
}

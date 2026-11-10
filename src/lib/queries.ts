import "server-only";
import { db } from "./db";
import { sumNutrients } from "./nutrition/totals";
import { addDays, todayLocal } from "./dates";
import { CHECKIN_DAYS, weeklyCheckin } from "./nutrition/checkin";
import type { ActivityLevel, Goal, Sex } from "./nutrition/targets";
import { carbBudget } from "./nutrition/diabetes";
import { buildRecap, lastFullWeek, type Recap } from "./recap";

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

/** Steps and sleep sent by the linked phone, by local date from `from` to `to`. */
export async function getActivity(userId: string, from: string, to: string) {
  return db.dailyActivity.findMany({
    where: { userId, localDate: { gte: from, lte: to } },
    orderBy: { localDate: "asc" },
    select: { localDate: true, steps: true, sleepMinutes: true },
  });
}

/** The days a step bonus for `date` looks at: that day and the 28 before it. */
export const stepBonusWindow = (date: string) => [addDays(date, -28), date] as const;

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
  durationSec: number | null;
  distanceM: number | null;
}

/** Sets from the most recent *other* finished session, per exercise. */
export async function lastSessionSets(userId: string, exerciseIds: string[], excludeSessionId?: string) {
  const out = new Map<string, { date: string; sets: PrevSet[] }>();
  if (exerciseIds.length === 0) return out;
  const session = { userId, endedAt: { not: null }, ...(excludeSessionId ? { id: { not: excludeSessionId } } : {}) };
  // Each exercise's latest session on its own, so a lift done every week can't crowd out one done rarely.
  const latest = await Promise.all(
    exerciseIds.map((exerciseId) =>
      db.workoutSet.findFirst({
        where: { exerciseId, session },
        orderBy: { completedAt: "desc" },
        select: { exerciseId: true, sessionId: true, session: { select: { localDate: true } } },
      }),
    ),
  );
  const found = latest.filter((l) => l !== null);
  if (found.length === 0) return out;
  const rows = await db.workoutSet.findMany({
    where: { OR: found.map(({ exerciseId, sessionId }) => ({ exerciseId, sessionId })) },
    orderBy: { setIndex: "asc" },
    select: { exerciseId: true, weightKg: true, reps: true, isWarmup: true, durationSec: true, distanceM: true },
  });
  for (const l of found) {
    out.set(l.exerciseId, {
      date: l.session.localDate,
      sets: rows.filter((r) => r.exerciseId === l.exerciseId).map(({ exerciseId: _, ...set }) => set),
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
    activityLevel: ActivityLevel;
    diabetesMode: boolean;
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
    carbCapG: profile.diabetesMode ? carbBudget(profile.sex, profile.activityLevel).dailyMax : null,
  });
}

/** Last full week (Monday to Sunday, the user's time) in numbers, or null when nothing was logged. */
export async function getWeeklyRecap(userId: string, timezone: string, targetKcal: number): Promise<Recap | null> {
  const { start, end } = lastFullWeek(todayLocal(timezone));
  const inWeek = { gte: start, lte: end };
  const finished = { userId, localDate: inWeek, endedAt: { not: null } };
  const [sessions, records, meals, weighIns, before] = await Promise.all([
    db.workoutSession.findMany({ where: finished, select: { localDate: true, _count: { select: { sets: { where: { isWarmup: false } } } } } }),
    db.personalRecord.findMany({ where: { userId, set: { session: finished } }, select: { set: { select: { session: { select: { localDate: true } } } } } }),
    db.meal.findMany({ where: { userId, localDate: inWeek }, select: { localDate: true, kcal: true } }),
    db.bodyMetric.findMany({ where: { userId, localDate: inWeek }, select: { localDate: true, weightKg: true } }),
    db.bodyMetric.findFirst({ where: { userId, localDate: { lt: start } }, orderBy: { localDate: "desc" }, select: { weightKg: true } }),
  ]);
  return buildRecap({
    start,
    end,
    sessions: sessions.map((s) => ({ localDate: s.localDate, workingSets: s._count.sets })),
    records: records.map((r) => ({ localDate: r.set.session.localDate })),
    meals,
    targetKcal,
    weighIns,
    before,
  });
}

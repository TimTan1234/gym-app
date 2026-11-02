// Pure helpers for the progress dashboard.

import { addDays, dateRange } from "./dates";

/** Trailing moving average over calendar days (missing days are skipped, not zero). */
export function movingAverage(points: { date: string; value: number }[], windowDays = 7) {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((p) => {
    const from = addDays(p.date, -(windowDays - 1));
    const inWindow = sorted.filter((q) => q.date >= from && q.date <= p.date);
    const avg = inWindow.reduce((s, q) => s + q.value, 0) / inWindow.length;
    return { date: p.date, value: p.value, avg: Math.round(avg * 10) / 10 };
  });
}

/** Fill every date in [start, end] with a value (0 when missing). */
export function fillDays(values: Map<string, number>, start: string, end: string) {
  return dateRange(start, end).map((date) => ({ date, value: Math.round(values.get(date) ?? 0) }));
}

export interface AdherenceStats {
  daysLogged: number;
  avgKcal: number;
  avgProtein: number;
  /** Share of logged days within ±10% of the calorie target. */
  kcalOnTargetPct: number;
  /** Share of logged days reaching ≥ 90% of the protein target. */
  proteinHitPct: number;
}

export function adherence(
  days: { kcal: number; proteinG: number }[],
  targets: { kcal: number; proteinG: number },
): AdherenceStats {
  const logged = days.filter((d) => d.kcal > 0);
  if (logged.length === 0) return { daysLogged: 0, avgKcal: 0, avgProtein: 0, kcalOnTargetPct: 0, proteinHitPct: 0 };
  const n = logged.length;
  const onTarget = logged.filter((d) => Math.abs(d.kcal - targets.kcal) <= targets.kcal * 0.1).length;
  const proteinHit = logged.filter((d) => d.proteinG >= targets.proteinG * 0.9).length;
  return {
    daysLogged: n,
    avgKcal: Math.round(logged.reduce((s, d) => s + d.kcal, 0) / n),
    avgProtein: Math.round(logged.reduce((s, d) => s + d.proteinG, 0) / n),
    kcalOnTargetPct: Math.round((onTarget / n) * 100),
    proteinHitPct: Math.round((proteinHit / n) * 100),
  };
}

/** Consecutive days ending today (or yesterday, if today isn't logged yet) that satisfy `ok`. */
export function currentStreak(byDate: Map<string, boolean>, today: string): number {
  let d = byDate.get(today) ? today : addDays(today, -1);
  let n = 0;
  while (byDate.get(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

/** Working sets per primary muscle. */
export function setsPerMuscle(sets: { isWarmup: boolean; primaryMuscle: string }[]) {
  const counts = new Map<string, number>();
  for (const s of sets) if (!s.isWarmup) counts.set(s.primaryMuscle, (counts.get(s.primaryMuscle) ?? 0) + 1);
  return [...counts].map(([muscle, value]) => ({ muscle, value })).sort((a, b) => b.value - a.value);
}

export interface MuscleLoad {
  /** Working sets with this as the primary muscle: the same count as setsPerMuscle. */
  sets: number;
  /** Working sets where it only helped (a secondary muscle). Never added to `sets`. */
  assisted: number;
  /** The last day it was worked either way. */
  lastDate: string;
}

/** Per muscle, how it was worked across the given sessions (the body map's data). */
export function muscleLoad(
  sessions: { localDate: string; sets: { isWarmup: boolean; primaryMuscle: string; secondaryMuscles: string[] }[] }[],
) {
  const load = new Map<string, MuscleLoad>();
  const add = (muscle: string, date: string, field: "sets" | "assisted") => {
    const cur = load.get(muscle) ?? { sets: 0, assisted: 0, lastDate: date };
    cur[field]++;
    if (date > cur.lastDate) cur.lastDate = date;
    load.set(muscle, cur);
  };
  for (const session of sessions)
    for (const set of session.sets) {
      if (set.isWarmup) continue;
      add(set.primaryMuscle, session.localDate, "sets");
      for (const m of set.secondaryMuscles) if (m !== set.primaryMuscle) add(m, session.localDate, "assisted");
    }
  return load;
}

export interface TrainingLoad {
  /** Working sets in the last 7 days. */
  week: number;
  /** Average working sets per week over the 4 weeks before that. */
  usual: number;
  /** week vs usual, as a fraction (0.35 = 35% more). */
  change: number;
  status: "heavier" | "usual" | "lighter";
}

/**
 * This week's working sets against the lifter's own usual week: a plain-language
 * stand-in for fitness/fatigue models, built only from logged sets. Null until
 * at least 2 of the 4 earlier weeks had training, so a new user isn't told off.
 */
export function trainingLoad(days: { date: string; sets: number }[], today: string, band = 0.3): TrainingLoad | null {
  const weekStart = addDays(today, -6);
  const historyStart = addDays(weekStart, -28);
  const week = days.filter((d) => d.date >= weekStart && d.date <= today).reduce((a, d) => a + d.sets, 0);
  const earlier = [0, 1, 2, 3].map((i) => {
    const from = addDays(historyStart, i * 7);
    const to = addDays(from, 6);
    return days.filter((d) => d.date >= from && d.date <= to).reduce((a, d) => a + d.sets, 0);
  });
  if (earlier.filter((n) => n > 0).length < 2) return null;
  const usual = earlier.reduce((a, b) => a + b, 0) / 4;
  const change = week / usual - 1;
  return { week, usual, change, status: change > band ? "heavier" : change < -band ? "lighter" : "usual" };
}

// The weekly recap: last week's training, eating and weight in a few numbers. Pure.

import { addDays, startOfWeek } from "./dates";

/** Monday to Sunday of the last week that has ended, for `today` in the user's timezone. */
export function lastFullWeek(today: string): { start: string; end: string } {
  const monday = startOfWeek(today);
  return { start: addDays(monday, -7), end: addDays(monday, -1) };
}

export interface RecapInput {
  start: string;
  end: string;
  /** Finished workouts in the week, with their working (non-warm-up) sets. */
  sessions: { localDate: string; workingSets: number }[];
  /** Records set by the week's sets, by the workout's date. */
  records: { localDate: string }[];
  /** Meals logged in the week, by local date. */
  meals: { localDate: string; kcal: number }[];
  targetKcal: number;
  /** Weigh-ins in the week, in any order. */
  weighIns: { localDate: string; weightKg: number }[];
  /** The last weigh-in before the week. */
  before: { weightKg: number } | null;
}

export interface RecapDay {
  date: string;
  /** Working sets that day; 0 is a rest day. */
  sets: number;
  record: boolean;
}

export interface Recap {
  start: string;
  end: string;
  workouts: number;
  workingSets: number;
  records: number;
  /** Monday to Sunday. */
  days: RecapDay[];
  /** Average over the days with meals logged; days left blank don't pull it down. */
  avgKcal: number | null;
  targetKcal: number;
  /** Where the week started: the last weigh-in before it, or its own first when there are two or more. */
  weightStartKg: number | null;
  /** The week's last weigh-in. */
  weightEndKg: number | null;
}

/** The recap, or null for a week with nothing logged. */
export function buildRecap(i: RecapInput): Recap | null {
  const kcalByDay = new Map<string, number>();
  for (const m of i.meals) kcalByDay.set(m.localDate, (kcalByDay.get(m.localDate) ?? 0) + m.kcal);
  const kcal = [...kcalByDay.values()];
  const weighIns = i.weighIns.toSorted((a, b) => a.localDate.localeCompare(b.localDate));
  if (i.sessions.length === 0 && kcal.length === 0 && weighIns.length === 0) return null;

  const days: RecapDay[] = Array.from({ length: 7 }, (_, d) => {
    const date = addDays(i.start, d);
    return {
      date,
      sets: i.sessions.filter((s) => s.localDate === date).reduce((n, s) => n + s.workingSets, 0),
      record: i.records.some((r) => r.localDate === date),
    };
  });
  const end = weighIns.at(-1)?.weightKg ?? null;
  return {
    start: i.start,
    end: i.end,
    workouts: i.sessions.length,
    workingSets: days.reduce((n, d) => n + d.sets, 0),
    records: i.records.length,
    days,
    avgKcal: kcal.length ? Math.round(kcal.reduce((a, b) => a + b, 0) / kcal.length) : null,
    targetKcal: i.targetKcal,
    weightStartKg: end === null ? null : (i.before?.weightKg ?? (weighIns.length > 1 ? weighIns[0].weightKg : null)),
    weightEndKg: end,
  };
}

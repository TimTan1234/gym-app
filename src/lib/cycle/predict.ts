// Cycle prediction from logged period starts. All dates are YYYY-MM-DD strings in
// the user's timezone.
//
// Model: gaps between consecutive starts of 16-44 days count as cycles (shorter or
// longer gaps are a missed or duplicate log). The cycle length blends the median
// with a recency-weighted mean, and a one-step-ahead backtest over the user's own
// history corrects its bias and sets how uncertain the next start is. Ovulation is
// placed 14 days before a start; the fertile window spans the 5 days before the
// earliest likely ovulation to the day after the latest, with a luteal phase of
// 13-15 days (tight history), 12-16 or 11-17 days (sparse or irregular history).

import { addDays, daysBetween } from "@/lib/dates";

export interface PeriodRow {
  startDate: string;
  endDate: string | null;
}

export interface CycleSettings {
  /** Used until at least one cycle has been logged. */
  cycleLength: number;
  /** Used until at least two periods have an end date. */
  periodLength: number;
}

export type Tier = "high" | "medium" | "low";
export type Phase = "MENSTRUAL" | "FOLLICULAR" | "OVULATION" | "LUTEAL";

export interface Prediction {
  lastStart: string;
  nextStart: string;
  cycleLength: number;
  periodLength: number;
  /** ± days around the predicted start. */
  uncertainty: number;
  tier: Tier;
  lutealMin: number;
  lutealMax: number;
  /** Logged cycles (valid gaps between starts). */
  cycles: number;
  /** Mean absolute error of past predictions, in days; null before there are any. */
  maeDays: number | null;
}

export const MIN_CYCLE = 16;
/** A period end belongs to the latest start at most this many days before it. */
export const MAX_END_AFTER_START = 14;
export const MAX_CYCLE = 44;
const OVULATION_BEFORE_START = 14;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
function median(xs: number[]) {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
const stdDev = (xs: number[]) => Math.sqrt(mean(xs.map((x) => (x - mean(xs)) ** 2)));

/** Cycle lengths between consecutive starts, newest first; gaps outside 16-44 days are dropped. */
export function validIntervals(startsNewestFirst: string[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < startsNewestFirst.length - 1; i++) {
    const d = daysBetween(startsNewestFirst[i + 1], startsNewestFirst[i]);
    if (d >= MIN_CYCLE && d <= MAX_CYCLE) out.push(d);
  }
  return out;
}

const RECENCY_WEIGHTS = [0.4, 0.25, 0.15, 0.1, 0.05, 0.05];

/** Cycle length (20-40) and spread from intervals, newest first. */
export function robustModel(intervals: number[], fallback: number) {
  if (intervals.length === 0) return { cycleLength: fallback, variability: 0 };
  const recent = intervals.slice(0, RECENCY_WEIGHTS.length);
  const weights = RECENCY_WEIGHTS.slice(0, recent.length);
  const weighted = recent.reduce((s, x, i) => s + x * weights[i], 0) / weights.reduce((a, b) => a + b, 0);
  const mid = median(intervals);
  const robustSigma = median(intervals.map((x) => Math.abs(x - mid))) * 1.4826;
  const blended = intervals.length >= 3 ? 0.6 * mid + 0.4 * weighted : weighted;
  return { cycleLength: Math.round(clamp(blended, 20, 40)), variability: robustSigma > 0 ? robustSigma : stdDev(intervals) };
}

/** Last day of a period: its end date, or the usual period length from its start. */
export function periodEnd(p: PeriodRow, periodLength: number): string {
  return p.endDate ?? addDays(p.startDate, periodLength - 1);
}

/** Usual period length: the mean of logged periods once two have an end date. */
export function learnedPeriodLength(periods: PeriodRow[], fallback: number): number {
  const lengths = periods.flatMap((p) => (p.endDate ? [daysBetween(p.startDate, p.endDate) + 1] : []));
  return lengths.length >= 2 ? clamp(Math.round(mean(lengths)), 1, 10) : fallback;
}

function uncertaintyFor(errorDays: number, intervals: number) {
  const u = errorDays <= 1 ? 1 : errorDays <= 1.8 ? 2 : errorDays <= 2.8 ? 3 : errorDays <= 3.8 ? 4 : 5;
  return intervals < 3 ? Math.max(u, 4) : u;
}

/** Next period and how sure we are of it; null before any period is logged. */
export function predictCycle(periods: PeriodRow[], settings: CycleSettings): Prediction | null {
  if (periods.length === 0) return null;
  const fallback = Math.round(clamp(settings.cycleLength, 20, 40));
  const starts = [...new Set(periods.map((p) => p.startDate))].sort((a, b) => b.localeCompare(a));
  const intervals = validIntervals(starts);
  const model = robustModel(intervals, fallback);

  // Predict each logged start from the ones before it; the errors give the bias and the spread.
  const ascending = [...starts].reverse();
  const errors: number[] = [];
  for (let i = 2; i < ascending.length; i++) {
    const training = validIntervals(ascending.slice(0, i).reverse());
    if (training.length === 0) continue;
    const predicted = addDays(ascending[i - 1], robustModel(training, fallback).cycleLength);
    const error = daysBetween(predicted, ascending[i]);
    if (Math.abs(error) <= 15) errors.push(error);
  }
  const recentErrors = errors.slice(-6);
  const bias = recentErrors.length ? Math.round(mean(recentErrors)) : 0;
  const cycleLength = Math.round(clamp(model.cycleLength + bias, 20, 40));
  const maeDays = recentErrors.length ? mean(recentErrors.map(Math.abs)) : null;

  const errorDays = Math.max(model.variability, maeDays ?? model.variability, 0.5);
  const tier: Tier = intervals.length >= 6 && errorDays <= 1.8 ? "high" : intervals.length >= 3 && errorDays <= 3.2 ? "medium" : "low";
  const [lutealMin, lutealMax] = tier === "high" ? [13, 15] : tier === "medium" ? [12, 16] : [11, 17];

  return {
    lastStart: starts[0],
    nextStart: addDays(starts[0], cycleLength),
    cycleLength,
    periodLength: learnedPeriodLength(periods, settings.periodLength),
    uncertainty: uncertaintyFor(errorDays, intervals.length),
    tier,
    lutealMin,
    lutealMax,
    cycles: intervals.length,
    maeDays: maeDays === null ? null : Math.round(maeDays * 10) / 10,
  };
}

export interface DayStatus {
  /** Inside a logged period. */
  logged: boolean;
  /** Inside a predicted period (never on a logged day). */
  predicted: boolean;
  fertile: boolean;
  ovulation: boolean;
}

/** The logged period containing `date`, if any. */
export function periodOn(date: string, periods: PeriodRow[], periodLength: number): PeriodRow | null {
  return periods.find((p) => p.startDate <= date && date <= periodEnd(p, periodLength)) ?? null;
}

/** Predicted starts from the next one onwards that could affect `date`. */
function projectedStarts(date: string, p: Prediction): string[] {
  const k0 = Math.round(daysBetween(p.nextStart, date) / p.cycleLength);
  const out: string[] = [];
  for (let k = Math.max(0, k0 - 2); k <= Math.max(0, k0 + 2); k++) out.push(addDays(p.nextStart, k * p.cycleLength));
  return out;
}

/** Calendar status of one day: logged, or predicted from the next start onwards. */
export function dayStatus(date: string, prediction: Prediction | null, periods: PeriodRow[]): DayStatus {
  const periodLength = prediction?.periodLength ?? 5;
  const logged = periodOn(date, periods, periodLength) !== null;
  const status: DayStatus = { logged, predicted: false, fertile: false, ovulation: false };
  if (!prediction || date <= prediction.lastStart) return status;
  const u = prediction.uncertainty;
  for (const ps of projectedStarts(date, prediction)) {
    if (!logged && date >= addDays(ps, -u) && date <= addDays(ps, periodLength - 1 + u)) status.predicted = true;
    if (date >= addDays(ps, -u - prediction.lutealMax - 5) && date <= addDays(ps, u - prediction.lutealMin + 1)) status.fertile = true;
    if (date === addDays(ps, -OVULATION_BEFORE_START)) status.ovulation = true;
  }
  if (logged) status.fertile = false;
  return status;
}

/**
 * Cycle phase on `date`: menstrual during a logged period, ovulation within a day
 * of the cycle's ovulation date (14 days before the next start, logged or
 * predicted), follicular before it and luteal after. Null before the first period.
 */
export function phaseOn(date: string, prediction: Prediction | null, periods: PeriodRow[]): Phase | null {
  if (!prediction) return null;
  if (periodOn(date, periods, prediction.periodLength)) return "MENSTRUAL";
  const starts = [...new Set(periods.map((p) => p.startDate))].sort();
  const cycleStart = starts.filter((s) => s <= date).at(-1);
  if (!cycleStart) return null;
  const nextLogged = starts.find((s) => s > date);
  // A late period keeps the cycle in its luteal phase until the next start is logged.
  if (!nextLogged && date >= prediction.nextStart) return "LUTEAL";
  const fromOvulation = daysBetween(addDays(nextLogged ?? prediction.nextStart, -OVULATION_BEFORE_START), date);
  if (Math.abs(fromOvulation) <= 1) return "OVULATION";
  return fromOvulation < 0 ? "FOLLICULAR" : "LUTEAL";
}

export interface CycleToday {
  /** Day of the current cycle, from 1 on the last logged start. */
  dayOfCycle: number;
  /** Days until the predicted start; negative once it's late. */
  daysUntilNext: number;
  /** Day of the period when today is inside a logged one. */
  periodDay: number | null;
  phase: Phase | null;
}

export function cycleToday(prediction: Prediction, periods: PeriodRow[], today: string): CycleToday {
  const current = periodOn(today, periods, prediction.periodLength);
  return {
    dayOfCycle: daysBetween(prediction.lastStart, today) + 1,
    daysUntilNext: daysBetween(today, prediction.nextStart),
    periodDay: current ? daysBetween(current.startDate, today) + 1 : null,
    phase: phaseOn(today, prediction, periods),
  };
}

/**
 * Period date ranges cut to the dates a chart actually has: each band runs from
 * the first to the last data date inside the period, and periods with no data
 * date inside are dropped. `dates` must be sorted.
 */
export function bandsOnDates(periods: PeriodRow[], periodLength: number, dates: string[]) {
  return periods.flatMap((p) => {
    const end = periodEnd(p, periodLength);
    const inside = dates.filter((d) => d >= p.startDate && d <= end);
    return inside.length ? [{ start: inside[0], end: inside.at(-1)! }] : [];
  });
}

// Weekly check-in: estimate what the user actually burns from what they ate
// and how their weight trend moved, then suggest a calorie target that
// matches their goal. Deterministic; the AI coach only explains the result.

import { addDays, dateRange } from "@/lib/dates";
import { KCAL_FLOOR, goalDelta, type Goal, type Sex } from "./targets";

export const CHECKIN_DAYS = 14;
const KCAL_PER_KG = 7700;
/** Days with less than this share of the target are treated as partly logged. */
const PARTIAL_DAY_SHARE = 0.5;
const MIN_LOGGED_DAYS = 10;
const MIN_WEIGH_INS = 4;
const MIN_WEIGHT_SPAN_DAYS = 10;
/** Largest change one check-in may make, so a noisy week can't swing targets. */
export const MAX_STEP_KCAL = 250;
/** Differences smaller than this aren't worth changing targets for. */
const ON_TRACK_KCAL = 75;

export interface CheckinInput {
  /** Today's local date; the window ends yesterday, since today is incomplete. */
  today: string;
  /** Total kcal per local date (unlogged dates absent). */
  intake: { date: string; kcal: number }[];
  /** Weigh-ins, including up to a week before the window for smoothing. */
  weights: { date: string; weightKg: number }[];
  targetKcal: number;
  proteinG: number;
  goal: Goal;
  rateKgPerWeek: number;
  sex: Sex;
  /** Local date the targets were last changed by the user, if known. */
  targetsSetOn?: string | null;
}

export interface CheckinResult {
  start: string;
  end: string;
  daysLogged: number;
  weighIns: number;
  /** What's still needed before an estimate can be made; empty when ready. */
  missing: string[];
  avgIntakeKcal: number | null;
  /** Trend-weight change scaled to a week (kg, negative = losing). */
  weeklyChangeKg: number | null;
  /** The weekly change the goal asks for (kg, signed). */
  goalWeeklyChangeKg: number;
  estimatedTdee: number | null;
  /** "waiting": targets changed less than a week ago, so this data doesn't reflect them yet. */
  status: "insufficient" | "on_track" | "adjust" | "waiting";
  suggested: { kcal: number; proteinG: number; carbsG: number; fatG: number } | null;
  /** When status is "waiting", the first day a new suggestion can be made. */
  nextOn: string | null;
}

/** Same split as the initial targets: protein kept, fat 25% of kcal, carbs fill the rest. */
export function macrosFor(kcal: number, proteinG: number) {
  const fatG = Math.round((kcal * 0.25) / 9);
  const carbsG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4));
  return { kcal, proteinG, carbsG, fatG };
}

/** 7-day trailing average at each weigh-in (unrounded; 0.1 kg matters here). */
function trendWeights(weights: { date: string; weightKg: number }[]) {
  const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((w) => {
    const from = addDays(w.date, -6);
    const inWindow = sorted.filter((q) => q.date >= from && q.date <= w.date);
    return { date: w.date, avg: inWindow.reduce((s, q) => s + q.weightKg, 0) / inWindow.length };
  });
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

export function weeklyCheckin(input: CheckinInput): CheckinResult {
  const end = addDays(input.today, -1);
  const start = addDays(end, -(CHECKIN_DAYS - 1));
  const window = new Set(dateRange(start, end));

  const fullDays = input.intake.filter((d) => window.has(d.date) && d.kcal >= input.targetKcal * PARTIAL_DAY_SHARE);
  const daysLogged = fullDays.length;
  const avgIntakeKcal = daysLogged ? Math.round(fullDays.reduce((s, d) => s + d.kcal, 0) / daysLogged) : null;

  const trend = trendWeights(input.weights.filter((w) => w.date >= addDays(start, -6) && w.date <= end)).filter((p) => window.has(p.date));
  const weighIns = trend.length;
  const span = weighIns >= 2 ? daysBetween(trend[0].date, trend.at(-1)!.date) : 0;

  const signedRate = input.goal === "CUT" ? -input.rateKgPerWeek : input.goal === "BULK" ? input.rateKgPerWeek : 0;
  const base = {
    start,
    end,
    daysLogged,
    weighIns,
    avgIntakeKcal,
    goalWeeklyChangeKg: Math.round(signedRate * 100) / 100,
    nextOn: null,
  };

  const missing: string[] = [];
  if (daysLogged < MIN_LOGGED_DAYS) missing.push(`${MIN_LOGGED_DAYS - daysLogged} more fully logged days`);
  if (weighIns < MIN_WEIGH_INS) missing.push(`${MIN_WEIGH_INS - weighIns} more weigh-ins`);
  else if (span < MIN_WEIGHT_SPAN_DAYS) missing.push(`weigh-ins spread over at least ${MIN_WEIGHT_SPAN_DAYS} days`);

  if (missing.length > 0 || avgIntakeKcal === null) {
    return { ...base, missing, weeklyChangeKg: null, estimatedTdee: null, status: "insufficient", suggested: null };
  }

  const changeKg = trend.at(-1)!.avg - trend[0].avg;
  const weeklyChangeKg = Math.round(((changeKg / span) * 7) * 100) / 100;
  const estimatedTdee = Math.round(avgIntakeKcal - (changeKg * KCAL_PER_KG) / span);

  // Implausible estimates almost always mean meals went unlogged.
  if (estimatedTdee < 1000 || estimatedTdee > 6000) {
    return {
      ...base,
      missing: ["more complete food logs (the numbers don't add up yet)"],
      weeklyChangeKg,
      estimatedTdee: null,
      status: "insufficient",
      suggested: null,
    };
  }

  // One change per week: after a change, wait for data eaten on the new target.
  if (input.targetsSetOn && daysBetween(input.targetsSetOn, input.today) < 7) {
    const nextOn = addDays(input.targetsSetOn, 7);
    return { ...base, missing, weeklyChangeKg, estimatedTdee, status: "waiting", suggested: null, nextOn };
  }

  const ideal = Math.max(estimatedTdee + goalDelta(input.goal, input.rateKgPerWeek), KCAL_FLOOR[input.sex]);
  const diff = ideal - input.targetKcal;
  if (Math.abs(diff) < ON_TRACK_KCAL) {
    return { ...base, missing, weeklyChangeKg, estimatedTdee, status: "on_track", suggested: null };
  }
  const step = Math.max(-MAX_STEP_KCAL, Math.min(MAX_STEP_KCAL, diff));
  const kcal = Math.max(KCAL_FLOOR[input.sex], Math.round((input.targetKcal + step) / 10) * 10);
  if (kcal === input.targetKcal) {
    return { ...base, missing, weeklyChangeKg, estimatedTdee, status: "on_track", suggested: null };
  }
  return { ...base, missing, weeklyChangeKg, estimatedTdee, status: "adjust", suggested: macrosFor(kcal, input.proteinG) };
}

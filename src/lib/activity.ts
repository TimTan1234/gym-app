/** Steps and sleep from the linked phone: the rules that turn them into advice. Pure, so they're unit-tested. */

/** Under this, a night counts as short: most adults need 7 hours or more, and under 6 shows in training. */
export const SHORT_SLEEP_MINUTES = 6 * 60;

export interface SleepSignal {
  minutes: number;
  short: boolean;
}

/** Last night's sleep (the night you woke up from today), or null if the phone sent none. */
export function sleepSignal(minutes: number | null | undefined): SleepSignal | null {
  if (minutes === null || minutes === undefined || minutes <= 0) return null;
  return { minutes, short: minutes < SHORT_SLEEP_MINUTES };
}

/** Days of step history needed before extra steps earn extra calories. */
export const MIN_BASELINE_DAYS = 7;
/** Below this many steps over your usual, a day is just a normal day. */
export const MIN_EXTRA_STEPS = 1000;
export const MAX_STEP_BONUS_KCAL = 500;
// Walking costs about 0.4 kcal per kg of body weight per km above rest, at about 1,350 steps per km.
const KCAL_PER_STEP_PER_KG = 0.4 / 1350;

export interface StepBonus {
  /** Steps over your usual day. */
  extraSteps: number;
  kcal: number;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Extra calories for a day with more steps than usual. "Usual" is your own median over the days before
 * (your activity level already covers a usual day), so only the extra counts; a quiet day never lowers
 * the target. Null until there's enough history, or when the day isn't clearly busier.
 */
export function stepBonus(steps: number | null | undefined, history: number[], weightKg: number | null | undefined): StepBonus | null {
  if (!steps || !weightKg || history.length < MIN_BASELINE_DAYS) return null;
  const extraSteps = Math.round(steps - median(history));
  if (extraSteps < MIN_EXTRA_STEPS) return null;
  const kcal = Math.min(MAX_STEP_BONUS_KCAL, Math.round((extraSteps * KCAL_PER_STEP_PER_KG * weightKg) / 10) * 10);
  return kcal > 0 ? { extraSteps, kcal } : null;
}

/** "7 h 20 min" style parts, for both languages to format. */
export const hoursAndMinutes = (minutes: number) => ({ h: Math.floor(minutes / 60), m: Math.round(minutes % 60) });

/**
 * The step bonus for `date`, from that day and the 28 before it. Days with no steps (phone off, or
 * nothing recorded) don't count towards the usual day.
 */
export function stepBonusFor(rows: { localDate: string; steps: number | null }[], date: string, weightKg: number | null | undefined): StepBonus | null {
  const day = rows.find((r) => r.localDate === date);
  const history = rows.filter((r) => r.localDate < date && (r.steps ?? 0) > 0).map((r) => r.steps!);
  return stepBonus(day?.steps, history, weightKg);
}

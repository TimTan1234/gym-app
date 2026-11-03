// "Heads-up": symptoms the user tends to log at this point of their cycle.
//
// Each logged symptom is placed relative to the period around it: 1-14 days
// before the next start, or 0-7 days after the start it follows. A symptom seen
// at least twice gets its most common offset, and is forecast when today sits
// within a day of that offset.

import { daysBetween } from "@/lib/dates";
import type { PeriodRow, Prediction } from "./predict";
import type { SymptomEntry } from "./symptoms";

export interface ForecastItem {
  symptom: string;
  /** Days from the period start: negative = before the next period, 0+ = into the cycle. */
  offset: number;
}

const MIN_SEEN = 2;

export function symptomForecast(
  periods: PeriodRow[],
  days: { localDate: string; symptoms: SymptomEntry[] }[],
  prediction: Prediction,
  today: string,
): ForecastItem[] {
  const starts = [...new Set(periods.map((p) => p.startDate))].sort();
  const offsets = new Map<string, number[]>();
  const add = (name: string, offset: number) => offsets.set(name, [...(offsets.get(name) ?? []), offset]);

  for (const day of days) {
    const names = new Set(day.symptoms.map((s) => s.name));
    if (names.size === 0) continue;
    const next = starts.find((s) => s > day.localDate);
    const prev = starts.filter((s) => s <= day.localDate).at(-1);
    const before = next ? daysBetween(next, day.localDate) : null;
    const after = prev ? daysBetween(prev, day.localDate) : null;
    for (const name of names) {
      if (before !== null && before >= -14 && before <= -1) add(name, before);
      if (after !== null && after <= 7) add(name, after);
    }
  }

  const toNext = daysBetween(prediction.nextStart, today);
  const sinceLast = daysBetween(prediction.lastStart, today);
  const out: ForecastItem[] = [];
  for (const [symptom, list] of offsets) {
    if (list.length < MIN_SEEN) continue;
    const counts = new Map<number, number>();
    for (const o of list) counts.set(o, (counts.get(o) ?? 0) + 1);
    const [offset] = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
    const now = offset < 0 ? toNext : sinceLast;
    if (Math.abs(now - offset) <= 1) out.push({ symptom, offset });
  }
  return out;
}

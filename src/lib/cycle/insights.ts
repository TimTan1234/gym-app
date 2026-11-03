// History statistics for the cycle History page.

import { daysBetween } from "@/lib/dates";
import { MAX_CYCLE, MIN_CYCLE, type PeriodRow } from "./predict";
import { FLOWS, SEVERITY_RANK, type FlowValue, type SymptomEntry } from "./symptoms";

export interface LoggedDay {
  localDate: string;
  flow: FlowValue | null;
  symptoms: SymptomEntry[];
}

export interface CycleTrendPoint {
  startDate: string;
  /** Days to the next start; null for the current cycle or a gap outside 16-44 days. */
  length: number | null;
}

export interface CycleInsights {
  trackedCycles: number;
  trackedDays: number;
  averageCycleLength: number | null;
  averagePeriodLength: number | null;
  /** Standard deviation of cycle lengths, in days. */
  variability: number | null;
  trend: CycleTrendPoint[];
  /** Most frequent symptoms, counted once per day; severity 1-3. */
  symptoms: { name: string; days: number; averageSeverity: number }[];
  flowCounts: Record<FlowValue, number>;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const round1 = (x: number) => Math.round(x * 10) / 10;
const TREND_CYCLES = 12;
const TOP_SYMPTOMS = 6;

export function cycleInsights(periods: PeriodRow[], days: LoggedDay[], fallbackPeriodLength: number): CycleInsights {
  const sorted = [...periods].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const lengthAfter = (i: number) => {
    if (i >= sorted.length - 1) return null;
    const d = daysBetween(sorted[i].startDate, sorted[i + 1].startDate);
    return d >= MIN_CYCLE && d <= MAX_CYCLE ? d : null;
  };
  const lengths = sorted.map((_, i) => lengthAfter(i));
  const valid = lengths.filter((l): l is number => l !== null);
  const usual = valid.length ? mean(valid) : null;

  const trend = sorted.slice(-TREND_CYCLES).map((p, j, recent) => ({ startDate: p.startDate, length: lengths[sorted.length - recent.length + j] }));

  const bySymptom = new Map<string, { days: number; severity: number }>();
  const flowCounts = Object.fromEntries(FLOWS.map((f) => [f, 0])) as Record<FlowValue, number>;
  for (const day of days) {
    for (const s of new Map(day.symptoms.map((s) => [s.name, s])).values()) {
      const cur = bySymptom.get(s.name) ?? { days: 0, severity: 0 };
      bySymptom.set(s.name, { days: cur.days + 1, severity: cur.severity + SEVERITY_RANK[s.severity] });
    }
    if (day.flow) flowCounts[day.flow] += 1;
  }

  return {
    trackedCycles: sorted.length,
    trackedDays: new Set(days.map((d) => d.localDate)).size,
    averageCycleLength: usual === null ? null : round1(usual),
    averagePeriodLength: sorted.length
      ? round1(mean(sorted.map((p) => (p.endDate ? daysBetween(p.startDate, p.endDate) + 1 : fallbackPeriodLength))))
      : null,
    variability: valid.length >= 2 ? round1(Math.sqrt(mean(valid.map((l) => (l - usual!) ** 2)))) : null,
    trend,
    symptoms: [...bySymptom.entries()]
      .map(([name, v]) => ({ name, days: v.days, averageSeverity: round1(v.severity / v.days) }))
      .sort((a, b) => b.days - a.days)
      .slice(0, TOP_SYMPTOMS),
    flowCounts,
  };
}

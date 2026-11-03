import { describe, expect, it } from "vitest";
import {
  bandsOnDates,
  cycleToday,
  dayStatus,
  learnedPeriodLength,
  phaseOn,
  predictCycle,
  robustModel,
  validIntervals,
  type PeriodRow,
} from "@/lib/cycle/predict";
import { cycleInsights } from "@/lib/cycle/insights";
import { symptomForecast } from "@/lib/cycle/forecast";
import { addDays, dateRange, daysBetween } from "@/lib/dates";

const SETTINGS = { cycleLength: 28, periodLength: 5 };

/** Period starts `gaps` days apart, ending on `last`, each lasting 5 days. */
function history(last: string, gaps: number[]): PeriodRow[] {
  const starts = [last];
  for (const g of gaps) starts.unshift(addDays(starts[0], -g));
  return starts.map((s) => ({ startDate: s, endDate: addDays(s, 4) }));
}

describe("daysBetween", () => {
  it("counts calendar days in either direction", () => {
    expect(daysBetween("2026-10-30", "2026-11-02")).toBe(3);
    expect(daysBetween("2026-11-02", "2026-10-30")).toBe(-3);
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
  });
});

describe("cycle model", () => {
  it("drops gaps outside 16-44 days (missed or duplicate logs)", () => {
    expect(validIntervals(["2026-04-01", "2026-03-04", "2026-03-02", "2026-01-01"])).toEqual([28]);
  });

  it("uses the recency-weighted mean below 3 cycles and blends in the median from 3", () => {
    expect(robustModel([], 30)).toEqual({ cycleLength: 30, variability: 0 });
    expect(robustModel([30, 26], 28).cycleLength).toBe(Math.round((30 * 0.4 + 26 * 0.25) / 0.65));
    // Median 28 dominates one long outlier.
    expect(robustModel([40, 28, 28, 28], 28).cycleLength).toBe(Math.round(0.6 * 28 + 0.4 * ((40 * 0.4 + 28 * 0.5) / 0.9)));
  });

  it("predicts from the profile length with one period, with wide uncertainty", () => {
    const p = predictCycle([{ startDate: "2026-11-01", endDate: null }], { cycleLength: 30, periodLength: 6 })!;
    expect(p.nextStart).toBe("2026-12-01");
    expect(p.periodLength).toBe(6);
    expect(p.uncertainty).toBeGreaterThanOrEqual(4);
    expect(p.tier).toBe("low");
  });

  it("is confident with a long regular history", () => {
    const p = predictCycle(history("2026-10-20", [29, 29, 29, 29, 29, 29, 29]), SETTINGS)!;
    expect(p.cycleLength).toBe(29);
    expect(p.nextStart).toBe("2026-11-18");
    expect(p.tier).toBe("high");
    expect(p.uncertainty).toBe(1);
    expect(p.maeDays).toBe(0);
    expect(p.cycles).toBe(7);
  });

  it("is unsure about irregular cycles", () => {
    const p = predictCycle(history("2026-10-20", [24, 35, 26, 38, 25]), SETTINGS)!;
    expect(p.tier).toBe("low");
    expect(p.uncertainty).toBeGreaterThanOrEqual(4);
  });

  it("learns the period length once two periods have an end", () => {
    expect(learnedPeriodLength([{ startDate: "2026-09-01", endDate: "2026-09-04" }], 5)).toBe(5);
    expect(
      learnedPeriodLength(
        [
          { startDate: "2026-09-01", endDate: "2026-09-04" },
          { startDate: "2026-10-01", endDate: "2026-10-04" },
          { startDate: "2026-10-29", endDate: null },
        ],
        5,
      ),
    ).toBe(4);
  });
});

describe("calendar and phase", () => {
  const periods = history("2026-10-20", [28, 28, 28, 28]);
  const p = predictCycle(periods, SETTINGS)!;

  it("marks logged days, an open period by the usual length, and nothing before the first", () => {
    expect(dayStatus("2026-10-24", p, periods).logged).toBe(true);
    expect(dayStatus("2026-10-25", p, periods).logged).toBe(false);
    const open = [{ startDate: "2026-11-01", endDate: null }];
    const q = predictCycle(open, SETTINGS)!;
    expect(dayStatus("2026-11-05", q, open).logged).toBe(true);
    expect(dayStatus("2026-11-06", q, open).logged).toBe(false);
  });

  it("shades the predicted period with its uncertainty and puts ovulation 14 days before", () => {
    expect(p.nextStart).toBe("2026-11-17");
    const u = p.uncertainty;
    expect(dayStatus(addDays("2026-11-17", -u), p, periods).predicted).toBe(true);
    expect(dayStatus(addDays("2026-11-17", -u - 1), p, periods).predicted).toBe(false);
    expect(dayStatus(addDays("2026-11-17", p.periodLength - 1 + u), p, periods).predicted).toBe(true);
    expect(dayStatus("2026-11-03", p, periods).ovulation).toBe(true);
    expect(dayStatus("2026-11-03", p, periods).fertile).toBe(true);
    // The cycle after next is projected too.
    expect(dayStatus("2026-12-01", p, periods).ovulation).toBe(true);
  });

  it("calls ovulation exactly where the calendar does, across a whole cycle", () => {
    const ovulation = dateRange(addDays(p.lastStart, 1), addDays(p.nextStart, -1)).filter((d) => dayStatus(d, p, periods).ovulation);
    expect(ovulation).toEqual(["2026-11-03"]);
    for (const d of dateRange(p.lastStart, addDays(p.nextStart, -1))) {
      const near = Math.abs(daysBetween("2026-11-03", d)) <= 1;
      expect(phaseOn(d, p, periods) === "OVULATION", d).toBe(near);
    }
  });

  it("runs menstrual → follicular → ovulation → luteal, and stays luteal when late", () => {
    expect(phaseOn("2026-10-22", p, periods)).toBe("MENSTRUAL");
    expect(phaseOn("2026-10-28", p, periods)).toBe("FOLLICULAR");
    expect(phaseOn("2026-11-02", p, periods)).toBe("OVULATION");
    expect(phaseOn("2026-11-10", p, periods)).toBe("LUTEAL");
    expect(phaseOn("2026-11-20", p, periods)).toBe("LUTEAL");
    expect(phaseOn("2025-01-01", p, periods)).toBeNull();
  });

  it("reports today's cycle day, countdown and period day", () => {
    expect(cycleToday(p, periods, "2026-10-21")).toEqual({ dayOfCycle: 2, daysUntilNext: 27, periodDay: 2, phase: "MENSTRUAL" });
    expect(cycleToday(p, periods, "2026-11-20").daysUntilNext).toBe(-3);
  });

  it("snaps period bands to the dates a chart has", () => {
    const rows = [
      { startDate: "2026-10-01", endDate: "2026-10-05" },
      { startDate: "2026-10-29", endDate: "2026-11-02" },
    ];
    expect(bandsOnDates(rows, 5, ["2026-09-30", "2026-10-02", "2026-10-04", "2026-10-10", "2026-11-05"])).toEqual([{ start: "2026-10-02", end: "2026-10-04" }]);
  });
});

describe("insights", () => {
  it("averages cycles and periods and counts symptoms once per day", () => {
    const periods = [
      { startDate: "2026-07-01", endDate: "2026-07-05" },
      { startDate: "2026-07-29", endDate: "2026-08-01" },
      { startDate: "2026-08-28", endDate: null },
    ];
    const days = [
      { localDate: "2026-07-01", flow: "HEAVY" as const, symptoms: [{ name: "CRAMPS", severity: "SEVERE" as const }] },
      { localDate: "2026-07-29", flow: "MEDIUM" as const, symptoms: [{ name: "CRAMPS", severity: "MILD" as const }, { name: "Back pain", severity: "MILD" as const }] },
    ];
    const s = cycleInsights(periods, days, 5);
    expect(s.averageCycleLength).toBe(29);
    expect(s.averagePeriodLength).toBe(Math.round(((5 + 4 + 5) / 3) * 10) / 10);
    expect(s.variability).toBe(1);
    expect(s.trend.map((t) => t.length)).toEqual([28, 30, null]);
    expect(s.symptoms[0]).toEqual({ name: "CRAMPS", days: 2, averageSeverity: 2 });
    expect(s.symptoms[1].name).toBe("Back pain");
    expect(s.flowCounts).toEqual({ SPOTTING: 0, LIGHT: 0, MEDIUM: 1, HEAVY: 1 });
  });
});

describe("symptom forecast", () => {
  it("flags a symptom logged at the same point in two cycles", () => {
    const periods = history("2026-10-20", [28, 28]);
    const p = predictCycle(periods, SETTINGS)!;
    const days = ["2026-09-20", "2026-10-18"].map((localDate) => ({ localDate, symptoms: [{ name: "HEADACHE", severity: "MILD" as const }] }));
    // Two days before each start.
    expect(symptomForecast(periods, days, p, addDays(p.nextStart, -2))).toEqual([{ symptom: "HEADACHE", offset: -2 }]);
    expect(symptomForecast(periods, days, p, addDays(p.nextStart, -6))).toEqual([]);
  });
});

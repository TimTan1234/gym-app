import { describe, expect, it } from "vitest";
import { adherence, currentStreak, fillDays, movingAverage, setsPerMuscle } from "@/lib/progress";

describe("movingAverage", () => {
  it("averages over a trailing calendar window, skipping missing days", () => {
    const res = movingAverage([
      { date: "2026-10-01", value: 80 },
      { date: "2026-10-03", value: 79 },
      { date: "2026-10-10", value: 78 },
    ]);
    expect(res.map((r) => r.avg)).toEqual([80, 79.5, 78]);
  });
});

describe("fillDays", () => {
  it("fills gaps with zero", () => {
    expect(fillDays(new Map([["2026-10-02", 1500.4]]), "2026-10-01", "2026-10-03")).toEqual([
      { date: "2026-10-01", value: 0 },
      { date: "2026-10-02", value: 1500 },
      { date: "2026-10-03", value: 0 },
    ]);
  });
});

describe("adherence", () => {
  it("ignores unlogged days and computes hit rates", () => {
    const s = adherence(
      [
        { kcal: 2000, proteinG: 150 },
        { kcal: 2500, proteinG: 100 },
        { kcal: 0, proteinG: 0 },
      ],
      { kcal: 2000, proteinG: 150 },
    );
    expect(s).toEqual({ daysLogged: 2, avgKcal: 2250, avgProtein: 125, kcalOnTargetPct: 50, proteinHitPct: 50 });
  });
  it("handles no data", () => {
    expect(adherence([], { kcal: 2000, proteinG: 150 }).daysLogged).toBe(0);
  });
});

describe("currentStreak", () => {
  const m = new Map([
    ["2026-10-17", true],
    ["2026-10-18", true],
    ["2026-10-19", true],
  ]);
  it("counts back from yesterday when today isn't logged yet", () => {
    expect(currentStreak(m, "2026-10-20")).toBe(3);
  });
  it("is zero after a missed day", () => {
    expect(currentStreak(m, "2026-10-21")).toBe(0);
  });
});

it("setsPerMuscle counts working sets only, sorted", () => {
  expect(
    setsPerMuscle([
      { isWarmup: false, primaryMuscle: "chest" },
      { isWarmup: true, primaryMuscle: "chest" },
      { isWarmup: false, primaryMuscle: "back" },
      { isWarmup: false, primaryMuscle: "back" },
    ]),
  ).toEqual([
    { muscle: "back", value: 2 },
    { muscle: "chest", value: 1 },
  ]);
});

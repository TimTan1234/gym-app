import { describe, expect, it } from "vitest";
import { adherence, currentStreak, fillDays, movingAverage, muscleLoad, setsPerMuscle, trainingLoad } from "@/lib/progress";

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

it("muscleLoad counts primary sets like setsPerMuscle, keeps helper sets apart, and tracks the last day", () => {
  const bench = { primaryMuscle: "chest", secondaryMuscles: ["triceps", "shoulders"] };
  const pushdown = { primaryMuscle: "triceps", secondaryMuscles: [] };
  const load = muscleLoad([
    { localDate: "2026-10-26", sets: [{ ...bench, isWarmup: true }, { ...bench, isWarmup: false }, { ...bench, isWarmup: false }] },
    { localDate: "2026-10-28", sets: [{ ...pushdown, isWarmup: false }] },
  ]);
  expect(load.get("chest")).toEqual({ sets: 2, assisted: 0, lastDate: "2026-10-26" });
  // Two bench sets helped, one pushdown set was direct; the latest is the pushdown day.
  expect(load.get("triceps")).toEqual({ sets: 1, assisted: 2, lastDate: "2026-10-28" });
  expect(load.get("shoulders")).toEqual({ sets: 0, assisted: 2, lastDate: "2026-10-26" });
  // Same number the Progress page shows.
  const flat = [bench, bench, pushdown].map((x) => ({ isWarmup: false, primaryMuscle: x.primaryMuscle }));
  expect(setsPerMuscle(flat).find((m) => m.muscle === "chest")?.value).toBe(load.get("chest")?.sets);
});

describe("trainingLoad", () => {
  const today = "2026-10-29";
  // 12 sets a week in each of the 4 weeks before this one (days 7..34 back).
  const history = [10, 17, 24, 31].map((back) => ({ date: addDaysFor(today, -back), sets: 12 }));
  function addDaysFor(d: string, n: number) {
    const x = new Date(`${d}T00:00:00Z`);
    x.setUTCDate(x.getUTCDate() + n);
    return x.toISOString().slice(0, 10);
  }

  it("compares the last 7 days with the usual week", () => {
    expect(trainingLoad([...history, { date: today, sets: 18 }], today)).toEqual({ week: 18, usual: 12, change: 0.5, status: "heavier" });
    expect(trainingLoad([...history, { date: addDaysFor(today, -6), sets: 13 }], today)?.status).toBe("usual");
    expect(trainingLoad([...history, { date: today, sets: 6 }], today)?.status).toBe("lighter");
  });

  it("counts a missing earlier week as zero, and waits for two weeks of history", () => {
    expect(trainingLoad([...history.slice(0, 2), { date: today, sets: 6 }], today)).toMatchObject({ usual: 6, status: "usual" });
    expect(trainingLoad([history[0], { date: today, sets: 30 }], today)).toBeNull();
  });

  it("ignores days outside the 5-week window", () => {
    expect(trainingLoad([...history, { date: addDaysFor(today, -40), sets: 99 }, { date: today, sets: 12 }], today)?.usual).toBe(12);
  });
});

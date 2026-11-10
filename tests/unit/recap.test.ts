import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildRecap, lastFullWeek, type RecapInput } from "@/lib/recap";
import { cardChinese } from "@/lib/recap-glyphs";

const week = { start: "2026-11-02", end: "2026-11-08" };
const empty: RecapInput = { ...week, sessions: [], records: [], meals: [], targetKcal: 2200, weighIns: [], before: null };

describe("lastFullWeek", () => {
  it("is the Monday-to-Sunday week before this one", () => {
    expect(lastFullWeek("2026-11-10")).toEqual(week); // a Tuesday
    expect(lastFullWeek("2026-11-09")).toEqual(week); // Monday: last week has just ended
    expect(lastFullWeek("2026-11-15")).toEqual(week); // Sunday: this week isn't over yet
    expect(lastFullWeek("2027-01-03")).toEqual({ start: "2026-12-21", end: "2026-12-27" });
  });
});

describe("buildRecap", () => {
  it("is null for a week with nothing logged", () => {
    expect(buildRecap(empty)).toBeNull();
    // A weigh-in before the week alone doesn't make a recap.
    expect(buildRecap({ ...empty, before: { weightKg: 80 } })).toBeNull();
  });

  it("lays the training out Monday to Sunday, with the days that set records", () => {
    const r = buildRecap({
      ...empty,
      sessions: [
        { localDate: "2026-11-02", workingSets: 14 },
        { localDate: "2026-11-04", workingSets: 12 },
        { localDate: "2026-11-04", workingSets: 3 }, // a second, short session that day
        { localDate: "2026-11-07", workingSets: 18 },
      ],
      records: [{ localDate: "2026-11-07" }, { localDate: "2026-11-07" }],
    })!;
    expect(r).toMatchObject({ workouts: 4, workingSets: 47, records: 2 });
    expect(r.days.map((d) => d.date)).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"]);
    expect(r.days.map((d) => d.sets)).toEqual([14, 0, 15, 0, 0, 18, 0]);
    expect(r.days.map((d) => d.record)).toEqual([false, false, false, false, false, true, false]);
  });

  it("averages calories over the days with meals, against the target", () => {
    const r = buildRecap({
      ...empty,
      meals: [
        { localDate: "2026-11-02", kcal: 600 },
        { localDate: "2026-11-02", kcal: 1500 },
        { localDate: "2026-11-04", kcal: 2400 },
      ],
    })!;
    expect(r).toMatchObject({ workouts: 0, avgKcal: 2250, targetKcal: 2200, weightStartKg: null, weightEndKg: null });
  });

  it("starts the weight from the last weigh-in before the week", () => {
    const r = buildRecap({
      ...empty,
      weighIns: [
        { localDate: "2026-11-08", weightKg: 79.4 },
        { localDate: "2026-11-03", weightKg: 79.9 },
      ],
      before: { weightKg: 80.2 },
    })!;
    expect(r).toMatchObject({ weightStartKg: 80.2, weightEndKg: 79.4 });
  });

  it("starts from the week's first weigh-in without an earlier one, and needs two for a start", () => {
    const one = [{ localDate: "2026-11-03", weightKg: 79.9 }];
    expect(buildRecap({ ...empty, weighIns: one })).toMatchObject({ weightStartKg: null, weightEndKg: 79.9 });
    expect(buildRecap({ ...empty, weighIns: [...one, { localDate: "2026-11-07", weightKg: 80.3 }] })).toMatchObject({ weightStartKg: 79.9, weightEndKg: 80.3 });
  });

  it("has no weight without a weigh-in in the week", () => {
    expect(buildRecap({ ...empty, meals: [{ localDate: "2026-11-02", kcal: 2000 }], before: { weightKg: 80 } })).toMatchObject({ weightStartKg: null, weightEndKg: null });
  });
});

describe("recap image fonts", () => {
  it("cover every Chinese character the card can show", () => {
    // Out of date after a copy change: run `npx tsx scripts/recap-fonts.ts`.
    const bundled = readFileSync(new URL("../../src/assets/recap/noto-sans-sc.chars.txt", import.meta.url), "utf8");
    expect([...cardChinese()].filter((c) => !bundled.includes(c))).toEqual([]);
  });
});

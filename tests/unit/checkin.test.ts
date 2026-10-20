import { describe, expect, it } from "vitest";
import { MAX_STEP_KCAL, weeklyCheckin, type CheckinInput } from "@/lib/nutrition/checkin";
import { addDays, dateRange } from "@/lib/dates";

const today = "2026-10-20";
const end = addDays(today, -1);
const start = addDays(end, -13);

/** 14 days at `kcal`, and a daily weigh-in losing `kgPerWeek` linearly from 80 kg. */
function input(kcal: number, kgPerWeek: number, overrides: Partial<CheckinInput> = {}): CheckinInput {
  const days = dateRange(addDays(start, -6), end);
  return {
    today,
    intake: dateRange(start, end).map((date) => ({ date, kcal })),
    weights: days.map((date, i) => ({ date, weightKg: 80 + (kgPerWeek / 7) * i })),
    targetKcal: 2000,
    proteinG: 170,
    goal: "CUT",
    rateKgPerWeek: 0.5,
    sex: "MALE",
    ...overrides,
  };
}

describe("weeklyCheckin", () => {
  it("needs enough logged days and weigh-ins", () => {
    const r = weeklyCheckin({ ...input(2000, -0.5), intake: [], weights: [] });
    expect(r.status).toBe("insufficient");
    expect(r.missing).toEqual([
      { code: "loggedDays", n: 10 },
      { code: "weighIns", n: 4 },
    ]);
    expect(r.suggested).toBeNull();
  });

  it("ignores today and days that look partly logged", () => {
    const base = input(2000, -0.5);
    const r = weeklyCheckin({
      ...base,
      intake: [...base.intake.slice(0, 9), { date: base.intake[9].date, kcal: 600 }, { date: today, kcal: 2000 }],
    });
    expect(r.daysLogged).toBe(9);
    expect(r.status).toBe("insufficient");
  });

  it("estimates TDEE from intake and the weight trend", () => {
    // Eating 2000 and losing 0.5 kg/week means burning ~2550.
    const r = weeklyCheckin(input(2000, -0.5));
    expect(r.weeklyChangeKg).toBeCloseTo(-0.5, 2);
    expect(r.estimatedTdee).toBe(2550);
    // Goal is -0.5 kg/week (-550/day), which is what is happening.
    expect(r.status).toBe("on_track");
  });

  it("lowers the target when weight isn't moving on a cut, capped per check-in", () => {
    const r = weeklyCheckin(input(2000, 0));
    expect(r.estimatedTdee).toBe(2000);
    expect(r.status).toBe("adjust");
    expect(r.suggested?.kcal).toBe(2000 - MAX_STEP_KCAL);
    expect(r.suggested?.proteinG).toBe(170);
  });

  it("raises the target when losing much faster than planned", () => {
    const r = weeklyCheckin(input(2000, -0.7));
    expect(r.status).toBe("adjust");
    expect(r.suggested!.kcal).toBeGreaterThan(2000);
    expect(r.suggested!.kcal).toBeLessThanOrEqual(2000 + MAX_STEP_KCAL);
  });

  it("never suggests below the safety floor", () => {
    const r = weeklyCheckin(input(1550, 0, { targetKcal: 1550 }));
    expect(r.suggested?.kcal ?? 1550).toBeGreaterThanOrEqual(1500);
  });

  it("flags implausible estimates as incomplete logging", () => {
    // Eating 900 kcal while gaining 1 kg/week can't be right.
    const r = weeklyCheckin(input(900, 1, { targetKcal: 1500 }));
    expect(r.status).toBe("insufficient");
    expect(r.estimatedTdee).toBeNull();
  });

  it("waits a week after the targets were changed", () => {
    const r = weeklyCheckin(input(2000, 0, { targetsSetOn: addDays(today, -3) }));
    expect(r.status).toBe("waiting");
    expect(r.suggested).toBeNull();
    expect(r.nextOn).toBe(addDays(today, 4));
    expect(r.estimatedTdee).toBe(2000);
    expect(weeklyCheckin(input(2000, 0, { targetsSetOn: addDays(today, -7) })).status).toBe("adjust");
  });
});

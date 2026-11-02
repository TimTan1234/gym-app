import { describe, expect, it } from "vitest";
import { MAX_STEP_BONUS_KCAL, hoursAndMinutes, sleepSignal, stepBonus } from "@/lib/activity";

describe("sleepSignal", () => {
  it("flags a night under 6 hours as short", () => {
    expect(sleepSignal(5 * 60 + 40)).toEqual({ minutes: 340, short: true });
    expect(sleepSignal(7 * 60)).toEqual({ minutes: 420, short: false });
    expect(sleepSignal(360)?.short).toBe(false);
  });
  it("is null with no sleep sent", () => {
    expect(sleepSignal(null)).toBeNull();
    expect(sleepSignal(0)).toBeNull();
  });
});

describe("stepBonus", () => {
  const usual = [6000, 6500, 7000, 7000, 7500, 8000, 6800]; // median 7,000

  it("counts only the steps over your own usual day", () => {
    // 4,000 extra steps × 0.4 kcal/kg/km ÷ 1,350 steps/km × 80 kg ≈ 95 → 90 kcal
    expect(stepBonus(11_000, usual, 80)).toEqual({ extraSteps: 4000, kcal: 90 });
  });
  it("gives nothing on a usual or quiet day, and never takes calories away", () => {
    expect(stepBonus(7500, usual, 80)).toBeNull();
    expect(stepBonus(2000, usual, 80)).toBeNull();
  });
  it("waits for a week of history and needs a body weight", () => {
    expect(stepBonus(15_000, usual.slice(0, 6), 80)).toBeNull();
    expect(stepBonus(15_000, usual, null)).toBeNull();
  });
  it("is capped", () => {
    expect(stepBonus(60_000, usual, 120)?.kcal).toBe(MAX_STEP_BONUS_KCAL);
  });
});

it("splits minutes into hours and minutes", () => {
  expect(hoursAndMinutes(445)).toEqual({ h: 7, m: 25 });
});

import { describe, expect, it } from "vitest";
import { bmrMifflin, computeTargets, goalDelta, KCAL_FLOOR } from "@/lib/nutrition/targets";

describe("bmrMifflin", () => {
  it("matches the published formula for men and women", () => {
    // 10*80 + 6.25*180 - 5*30 + 5 = 1780
    expect(bmrMifflin("MALE", 80, 180, 30)).toBe(1780);
    // 10*60 + 6.25*165 - 5*25 - 161 = 1345.25
    expect(bmrMifflin("FEMALE", 60, 165, 25)).toBeCloseTo(1345.25);
  });
});

describe("goalDelta", () => {
  it("is negative for cut, positive for bulk, zero for maintain", () => {
    expect(goalDelta("CUT", 0.5)).toBeCloseTo(-550);
    expect(goalDelta("BULK", 0.25)).toBeCloseTo(275);
    expect(goalDelta("MAINTAIN", 1)).toBe(0);
  });
  it("caps aggressive rates", () => {
    expect(goalDelta("CUT", 2)).toBe(-1000);
    expect(goalDelta("BULK", 2)).toBe(500);
  });
});

describe("computeTargets", () => {
  const base = {
    sex: "MALE" as const,
    age: 30,
    heightCm: 180,
    weightKg: 80,
    activityLevel: "MODERATE" as const,
    goal: "MAINTAIN" as const,
    rateKgPerWeek: 0.5,
  };

  it("computes TDEE and macros that add up to the calorie target", () => {
    const t = computeTargets(base);
    expect(t.tdee).toBe(Math.round(1780 * 1.55));
    expect(t.kcal).toBe(t.tdee);
    expect(t.proteinG).toBe(160);
    const macroKcal = t.proteinG * 4 + t.carbsG * 4 + t.fatG * 9;
    expect(Math.abs(macroKcal - t.kcal)).toBeLessThan(15);
    expect(t.clampedToFloor).toBe(false);
  });

  it("never goes below the safety floor", () => {
    const t = computeTargets({
      ...base,
      sex: "FEMALE",
      weightKg: 45,
      heightCm: 150,
      age: 60,
      activityLevel: "SEDENTARY",
      goal: "CUT",
      rateKgPerWeek: 1,
    });
    expect(t.kcal).toBe(KCAL_FLOOR.FEMALE);
    expect(t.clampedToFloor).toBe(true);
    expect(t.carbsG).toBeGreaterThanOrEqual(0);
  });
});

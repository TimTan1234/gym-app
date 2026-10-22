import { describe, expect, it } from "vitest";
import {
  DEFAULT_GLUCOSE_TARGETS as T,
  classifyReading,
  preExerciseAdvice,
  summarize,
  toDisplay,
  toMmol,
} from "@/lib/glucose";
import { carbBudget, giBand, highGiCarbShare } from "@/lib/nutrition/diabetes";
import { computeTargets, splitMacros } from "@/lib/nutrition/targets";
import { macrosFor } from "@/lib/nutrition/checkin";
import { fromLocalDateTime, toLocalTime } from "@/lib/dates";

describe("glucose classification (Malaysian CPG T2DM Table 3-5, section 4.1)", () => {
  it("judges fasting readings against 4.4-7.0 and after-meal ones against 8.5", () => {
    expect(classifyReading({ mmol: 6.8, context: "FASTING" }, T)).toBe("inTarget");
    expect(classifyReading({ mmol: 7.4, context: "FASTING" }, T)).toBe("above");
    expect(classifyReading({ mmol: 7.4, context: "AFTER_MEAL", minutesAfterMeal: 120 }, T)).toBe("inTarget");
    expect(classifyReading({ mmol: 9.1, context: "AFTER_MEAL", minutesAfterMeal: 120 }, T)).toBe("above");
  });

  it("flags lows in any context, and very high readings", () => {
    expect(classifyReading({ mmol: 3.8, context: "AFTER_MEAL" }, T)).toBe("low");
    expect(classifyReading({ mmol: 2.9, context: "FASTING" }, T)).toBe("severeLow");
    expect(classifyReading({ mmol: 16.7, context: "BEDTIME" }, T)).toBe("veryHigh");
  });

  it("doesn't judge an after-meal reading taken under 90 minutes after eating", () => {
    expect(classifyReading({ mmol: 10.2, context: "AFTER_MEAL", minutesAfterMeal: 45 }, T)).toBe("early");
    // ...unless it's low, which always matters
    expect(classifyReading({ mmol: 3.5, context: "AFTER_MEAL", minutesAfterMeal: 45 }, T)).toBe("low");
  });

  it("counts readings in target, leaving early ones out", () => {
    expect(summarize(["inTarget", "above", "low", "early", "severeLow", "veryHigh"])).toEqual({ count: 6, rated: 5, inTarget: 1, low: 2, above: 2 });
  });

  it("converts mg/dL for display and input", () => {
    expect(toDisplay(5.5, "MG_DL")).toBe(99);
    expect(toDisplay(5.55, "MMOL_L")).toBe(5.6);
    expect(toMmol(126, "MG_DL")).toBe(7);
  });
});

describe("before exercise (CPG Appendix 5)", () => {
  it("asks people on insulin or sulfonylureas to check first, and to eat under 5.6", () => {
    expect(preExerciseAdvice(null, true)).toBe("checkFirst");
    expect(preExerciseAdvice({ mmol: 5.2, minutesAgo: 10 }, true)).toBe("eatFirst");
    expect(preExerciseAdvice({ mmol: 5.2, minutesAgo: 10 }, false)).toBe("ok");
    expect(preExerciseAdvice({ mmol: 6.5, minutesAgo: 90 }, true)).toBe("checkFirst"); // too old to count
  });
  it("warns for low and very high readings whatever the medicine", () => {
    expect(preExerciseAdvice({ mmol: 3.6, minutesAgo: 5 }, false)).toBe("low");
    expect(preExerciseAdvice({ mmol: 18, minutesAgo: 5 }, false)).toBe("veryHigh");
    expect(preExerciseAdvice(null, false)).toBeNull();
  });
});

describe("carb budget (CPG Table 3-7) and GI bands (Appendix 4)", () => {
  it("gives 15 g exchanges per meal by sex and activity", () => {
    expect(carbBudget("FEMALE", "SEDENTARY").meal).toEqual({ min: 30, max: 60 });
    expect(carbBudget("FEMALE", "MODERATE").meal).toEqual({ min: 45, max: 75 });
    expect(carbBudget("MALE", "LIGHT").meal).toEqual({ min: 45, max: 75 });
    expect(carbBudget("MALE", "ACTIVE").meal).toEqual({ min: 60, max: 90 });
    expect(carbBudget("MALE", "ACTIVE").snack).toEqual({ min: 15, max: 30 });
    expect(carbBudget("FEMALE", "SEDENTARY").dailyMax).toBe(210);
  });
  it("bands GI at 55 and 70", () => {
    expect([giBand(40), giBand(55), giBand(56), giBand(70), giBand(73), giBand(null)]).toEqual(["low", "low", "intermediate", "intermediate", "high", null]);
  });
  it("measures the share of carbs from high-GI food, ignoring unknown GI", () => {
    expect(highGiCarbShare([{ carbsG: 60, gi: 73 }, { carbsG: 20, gi: 40 }, { carbsG: 50, gi: null }])).toEqual({ share: 0.75, knownCarbs: 80 });
    expect(highGiCarbShare([{ carbsG: 10, gi: null }])).toBeNull();
  });
});

describe("diabetes-mode targets", () => {
  const man = { sex: "MALE", age: 40, heightCm: 175, weightKg: 85, activityLevel: "MODERATE", goal: "MAINTAIN", rateKgPerWeek: 0 } as const;

  const share = (g: number, kcalPerG: number, kcal: number) => (g * kcalPerG) / kcal;

  it("follows the guideline split: protein at most 20%, fat at most 35%, carbs the rest", () => {
    const normal = computeTargets(man);
    const diabetes = computeTargets({ ...man, diabetes: true });
    expect(diabetes.kcal).toBe(normal.kcal);
    expect(diabetes.proteinG).toBeLessThan(normal.proteinG);
    expect(share(diabetes.proteinG, 4, diabetes.kcal)).toBeLessThanOrEqual(0.201);
    expect(diabetes.carbsG).toBeLessThan(normal.carbsG);
    // Protein and fat at their caps leave carbs a little over the meal budget, at 45% of kcal.
    expect(diabetes.carbsG).toBeLessThanOrEqual(carbBudget("MALE", "MODERATE").dailyMax + 10);
    expect(share(diabetes.carbsG, 4, diabetes.kcal)).toBeGreaterThanOrEqual(0.445);
    expect(share(diabetes.fatG, 9, diabetes.kcal)).toBeLessThanOrEqual(0.351);
    // calories still add up (within rounding)
    expect(Math.abs(diabetes.proteinG * 4 + diabetes.carbsG * 4 + diabetes.fatG * 9 - diabetes.kcal)).toBeLessThan(10);
  });

  it("never goes under 130 g of carbs, and lets carbs exceed the cap rather than fat exceed 35%", () => {
    expect(splitMacros(1400, 100, { carbCapG: 120, weightKg: 70 }).carbsG).toBeGreaterThanOrEqual(130);
    const big = splitMacros(4000, 180, { carbCapG: 210, weightKg: 90 });
    expect(big.fatG).toBe(Math.round((4000 * 0.35) / 9));
    expect(big.carbsG).toBeGreaterThan(210);
  });

  it("keeps 130 g of carbs and 25% fat at the calorie floor, lowering protein instead", () => {
    // A sedentary woman cutting: 1200 kcal, and 2.2 g/kg protein would be 176 g.
    const t = computeTargets({ sex: "FEMALE", age: 50, heightCm: 160, weightKg: 80, activityLevel: "SEDENTARY", goal: "CUT", rateKgPerWeek: 0.5, diabetes: true });
    expect(t.kcal).toBe(1200);
    expect(t.carbsG).toBeGreaterThanOrEqual(130);
    expect((t.fatG * 9) / t.kcal).toBeGreaterThanOrEqual(0.245);
    expect(t.proteinG).toBeLessThan(176);
    expect(Math.abs(t.proteinG * 4 + t.carbsG * 4 + t.fatG * 9 - t.kcal)).toBeLessThan(10);
    // Without diabetes mode protein stays at 2.2 g/kg.
    expect(computeTargets({ sex: "FEMALE", age: 50, heightCm: 160, weightKg: 80, activityLevel: "SEDENTARY", goal: "CUT", rateKgPerWeek: 0.5 }).proteinG).toBe(176);

    const m = macrosFor(1200, 176, { carbCapG: carbBudget("FEMALE", "SEDENTARY").dailyMax, weightKg: 80 });
    expect(m.carbsG).toBeGreaterThanOrEqual(130);
    expect(Math.abs(m.proteinG * 4 + m.carbsG * 4 + m.fatG * 9 - m.kcal)).toBeLessThan(10);
  });

  it("keeps protein to 20% of kcal, but never under 0.8 g/kg", () => {
    // 20% of 2000 kcal is 100 g.
    expect(splitMacros(2000, 160, { carbCapG: 300, weightKg: 75 }).proteinG).toBe(100);
    // A usual target already under the cap is kept.
    expect(splitMacros(2000, 90, { carbCapG: 300, weightKg: 75 }).proteinG).toBe(90);
    // 120 kg at 1500 kcal: 20% would be 75 g, under 0.8 g/kg (96 g).
    expect(splitMacros(1500, 220, { carbCapG: 300, weightKg: 120 }).proteinG).toBe(96);
    // Without diabetes mode nothing is capped.
    expect(splitMacros(2000, 160).proteinG).toBe(160);
  });

  it("applies the same rules to weekly check-in suggestions", () => {
    const m = macrosFor(2800, 170, { carbCapG: 300, weightKg: 85 });
    expect(share(m.proteinG, 4, 2800)).toBeLessThanOrEqual(0.201);
    expect(share(m.fatG, 9, 2800)).toBeLessThanOrEqual(0.351);
    expect(Math.abs(m.proteinG * 4 + m.carbsG * 4 + m.fatG * 9 - 2800)).toBeLessThan(10);
    expect(macrosFor(2800, 170)).toMatchObject({ proteinG: 170 });
  });
});

describe("local date and time", () => {
  it("turns a local wall-clock time back into the right instant", () => {
    const d = fromLocalDateTime("2026-10-22", "12:30", "Asia/Kuala_Lumpur");
    expect(d.toISOString()).toBe("2026-10-22T04:30:00.000Z");
    expect(toLocalTime(d, "Asia/Kuala_Lumpur")).toBe("12:30");
    // Across a DST change
    expect(fromLocalDateTime("2026-03-29", "09:00", "Europe/London").toISOString()).toBe("2026-03-29T08:00:00.000Z");
  });
});

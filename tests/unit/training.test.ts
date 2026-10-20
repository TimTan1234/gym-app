import { describe, expect, it } from "vitest";
import { estimate1RM } from "@/lib/training/oneRepMax";
import { suggestNext } from "@/lib/training/progression";
import { detectRecords } from "@/lib/training/records";

describe("estimate1RM", () => {
  it("uses Epley and returns weight for single reps", () => {
    expect(estimate1RM(100, 1)).toBe(100);
    expect(estimate1RM(100, 5)).toBe(116.7);
    expect(estimate1RM(100, 20)).toBe(estimate1RM(100, 12));
    expect(estimate1RM(0, 5)).toBe(0);
  });
});

describe("suggestNext", () => {
  const range = { repMin: 6, repMax: 10 };
  it("adds weight when all working sets hit the top of the range", () => {
    const s = suggestNext({
      ...range,
      isLowerBody: false,
      lastSets: [
        { weightKg: 40, reps: 12, isWarmup: true },
        { weightKg: 60, reps: 10, isWarmup: false },
        { weightKg: 60, reps: 10, isWarmup: false },
      ],
    });
    expect(s).toMatchObject({ weightKg: 62.5, reps: 6, reason: { kind: "addWeight", repMax: 10, incKg: 2.5 } });
  });
  it("uses a bigger jump for lower body", () => {
    const s = suggestNext({ ...range, isLowerBody: true, lastSets: [{ weightKg: 100, reps: 10, isWarmup: false }] });
    expect(s?.weightKg).toBe(105);
    expect(s?.reason).toEqual({ kind: "addWeight", repMax: 10, incKg: 5 });
  });
  it("keeps the weight and adds a rep otherwise", () => {
    const s = suggestNext({
      ...range,
      isLowerBody: false,
      lastSets: [
        { weightKg: 60, reps: 10, isWarmup: false },
        { weightKg: 60, reps: 7, isWarmup: false },
      ],
    });
    expect(s).toMatchObject({ weightKg: 60, reps: 8, reason: { kind: "addReps", target: 8 } });
  });
  it("returns null without working sets", () => {
    expect(suggestNext({ ...range, isLowerBody: false, lastSets: [] })).toBeNull();
  });
});

describe("detectRecords", () => {
  it("flags every record type on the first set", () => {
    expect(detectRecords({ weightKg: 60, reps: 5, isWarmup: false }, {}).map((r) => r.type)).toEqual([
      "MAX_WEIGHT",
      "EST_1RM",
      "MAX_VOLUME_SET",
    ]);
  });
  it("only flags records that are beaten", () => {
    const r = detectRecords(
      { weightKg: 60, reps: 12, isWarmup: false },
      { MAX_WEIGHT: 80, EST_1RM: 90, MAX_VOLUME_SET: 500 },
    );
    expect(r).toEqual([{ type: "MAX_VOLUME_SET", value: 720, previous: 500 }]);
  });
  it("ignores warm-ups and empty sets", () => {
    expect(detectRecords({ weightKg: 200, reps: 5, isWarmup: true }, {})).toEqual([]);
    expect(detectRecords({ weightKg: 0, reps: 5, isWarmup: false }, {})).toEqual([]);
  });
});

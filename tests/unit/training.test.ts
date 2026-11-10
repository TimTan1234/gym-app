import { describe, expect, it } from "vitest";
import { estimate1RM } from "@/lib/training/oneRepMax";
import { suggestNext } from "@/lib/training/progression";
import { detectRecords, earnedRecords } from "@/lib/training/records";
import { currentExercise } from "@/lib/training/summary";

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

describe("currentExercise", () => {
  const plan = [
    { id: "bench", targetSets: 2 },
    { id: "row", targetSets: 2 },
    { id: "curl", targetSets: 1 },
  ];
  const set = (exerciseId: string, isWarmup = false) => ({ exerciseId, isWarmup });

  it("starts at the first exercise and stays until its target is met", () => {
    expect(currentExercise(plan, [])).toBe("bench");
    expect(currentExercise(plan, [set("bench", true), set("bench")])).toBe("bench");
    expect(currentExercise(plan, [set("bench"), set("bench")])).toBe("row");
  });

  it("follows the exercise last logged, then picks up what was skipped", () => {
    expect(currentExercise(plan, [set("row")])).toBe("row");
    expect(currentExercise(plan, [set("row"), set("row")])).toBe("curl");
    expect(currentExercise(plan, [set("row"), set("row"), set("curl")])).toBe("bench");
  });

  it("is null once every planned set is done", () => {
    expect(currentExercise(plan, [set("bench"), set("bench"), set("row"), set("row"), set("curl")])).toBeNull();
  });

  it("keeps an exercise without a target until another is started", () => {
    const free = [{ id: "bench", targetSets: null }, { id: "dip", targetSets: null }];
    expect(currentExercise(free, [set("bench"), set("bench")])).toBe("bench");
    expect(currentExercise(free, [set("dip")])).toBe("dip");
    expect(currentExercise(free, [])).toBe("bench");
  });
});

describe("earnedRecords", () => {
  const at = (minute: number) => new Date(Date.UTC(2026, 10, 1, 10, minute));
  const set = (id: string, weightKg: number, reps: number, minute: number, isWarmup = false) => ({ id, weightKg, reps, isWarmup, completedAt: at(minute) });
  const holders = (sets: Parameters<typeof earnedRecords>[0]) => earnedRecords(sets).map((r) => `${r.setId}:${r.type}`);

  it("replays sets in the order they were done, as logging them would", () => {
    const records = earnedRecords([set("c", 70, 5, 3), set("a", 60, 5, 1), set("b", 60, 3, 2)]);
    expect(records.map((r) => `${r.setId}:${r.type}:${r.value}`)).toEqual([
      "a:MAX_WEIGHT:60",
      "a:EST_1RM:70",
      "a:MAX_VOLUME_SET:300",
      "c:MAX_WEIGHT:70",
      "c:EST_1RM:81.7",
      "c:MAX_VOLUME_SET:350",
    ]);
    expect(records[3].achievedAt).toEqual(at(3));
  });

  it("gives a later set the record a deleted heavier set had taken", () => {
    const before = [set("a", 100, 5, 1), set("mistake", 200, 5, 2), set("b", 105, 5, 3)];
    expect(holders(before)).not.toContain("b:MAX_WEIGHT");
    expect(holders(before.filter((s) => s.id !== "mistake"))).toContain("b:MAX_WEIGHT");
  });

  it("ties don't set a record, and warm-ups and cardio's zero-weight sets set none", () => {
    expect(holders([set("a", 60, 5, 1), set("b", 60, 5, 2), set("w", 90, 5, 3, true), set("run", 0, 0, 4)])).toEqual([
      "a:MAX_WEIGHT",
      "a:EST_1RM",
      "a:MAX_VOLUME_SET",
    ]);
  });
});

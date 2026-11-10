import { describe, expect, it } from "vitest";
import { parseSetEntry, setFields, type SetEntry } from "@/lib/training/set-entry";

const entry = (patch: Partial<SetEntry>): SetEntry => ({ weight: "", reps: "", rpe: "", minutes: "", distance: "", isWarmup: false, ...patch });

describe("parseSetEntry", () => {
  it("reads a lift as weight × reps in the user's units", () => {
    expect(parseSetEntry(entry({ weight: "135", reps: "8", rpe: "11" }), false, "IMPERIAL")).toMatchObject({
      weightKg: expect.closeTo(61.23, 2),
      reps: 8,
      rpe: 10,
      durationSec: null,
      distanceM: null,
    });
    expect(parseSetEntry(entry({ weight: "", reps: "12" }), false, "METRIC")).toMatchObject({ weightKg: 0, reps: 12 });
  });

  it("refuses a lift without whole reps", () => {
    expect(parseSetEntry(entry({ weight: "60", reps: "0" }), false, "METRIC")).toBeNull();
    expect(parseSetEntry(entry({ weight: "60", reps: "7.5" }), false, "METRIC")).toBeNull();
  });

  it("reads cardio as minutes and an optional distance, with no weight or reps", () => {
    expect(parseSetEntry(entry({ minutes: "25.5", distance: "3.1", weight: "60", reps: "8" }), true, "IMPERIAL")).toMatchObject({
      weightKg: 0,
      reps: 0,
      durationSec: 1530,
      distanceM: expect.closeTo(4988.97, 1),
    });
    expect(parseSetEntry(entry({ minutes: "10" }), true, "METRIC")).toMatchObject({ durationSec: 600, distanceM: null });
    expect(parseSetEntry(entry({ minutes: "", distance: "5" }), true, "METRIC")).toBeNull();
  });
});

describe("setFields", () => {
  const sent = { weightKg: 50, reps: 10, rpe: 7, isWarmup: false, durationSec: 900, distanceM: 2500 };

  it("keeps only what the exercise's kind records", () => {
    expect(setFields(true, sent)).toEqual({ weightKg: 0, reps: 0, rpe: 7, isWarmup: false, durationSec: 900, distanceM: 2500 });
    expect(setFields(false, sent)).toEqual({ weightKg: 50, reps: 10, rpe: 7, isWarmup: false, durationSec: null, distanceM: null });
  });

  it("needs a time for cardio, and takes sets queued before cardio existed", () => {
    expect(setFields(true, { ...sent, durationSec: null })).toBeNull();
    expect(setFields(false, { weightKg: 50, reps: 10, rpe: null, isWarmup: true })).toMatchObject({ durationSec: null, distanceM: null });
  });
});

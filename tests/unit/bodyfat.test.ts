import { describe, expect, it } from "vitest";
import { normalizeBodyFat } from "@/lib/ai/bodyfat";
import { BodyFatEstimateSchema } from "@/lib/ai/schemas";
import mock from "@/lib/ai/fixtures/bodyfat.json";

const usable = { usable: true, reason: null, cues: [] };

describe("normalizeBodyFat", () => {
  it("rounds to half points and keeps the mock fixture valid", () => {
    expect(normalizeBodyFat(BodyFatEstimateSchema.parse(mock))).toMatchObject({ estimatePct: 20.5, lowPct: 17, highPct: 23.5 });
  });

  it("widens a range narrower than ±2 points and orders low ≤ estimate ≤ high", () => {
    expect(normalizeBodyFat({ ...usable, estimatePct: 18, lowPct: 17.5, highPct: 18.4 })).toMatchObject({ lowPct: 16, highPct: 20 });
    expect(normalizeBodyFat({ ...usable, estimatePct: 18, lowPct: 22, highPct: 15 })).toMatchObject({ lowPct: 15, estimatePct: 18, highPct: 22 });
    expect(normalizeBodyFat({ ...usable, estimatePct: 18, lowPct: null, highPct: null })).toMatchObject({ lowPct: 16, highPct: 20 });
  });

  it("keeps numbers inside 3–60%", () => {
    expect(normalizeBodyFat({ ...usable, estimatePct: 1, lowPct: 0, highPct: 2 })).toMatchObject({ estimatePct: 3, lowPct: 3, highPct: 5 });
    expect(normalizeBodyFat({ ...usable, estimatePct: 75, lowPct: 70, highPct: 80 })).toMatchObject({ estimatePct: 60, highPct: 60 });
  });

  it("drops numbers and cues from an unusable result, and gives it a reason", () => {
    expect(normalizeBodyFat({ usable: false, reason: "appears_minor", estimatePct: 20, lowPct: 18, highPct: 22, cues: ["x"] })).toEqual({
      usable: false,
      reason: "appears_minor",
      estimatePct: null,
      lowPct: null,
      highPct: null,
      cues: [],
    });
    expect(normalizeBodyFat({ ...usable, estimatePct: null, lowPct: null, highPct: null }).reason).toBe("body_not_visible");
  });
});

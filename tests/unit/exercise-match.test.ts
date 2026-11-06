import { describe, expect, it } from "vitest";
import { matchedExerciseIds } from "@/lib/ai/exercise-match";

describe("matchedExerciseIds", () => {
  const library = ["leg-press", "hack-squat", "leg-extension", "seated-leg-curl", "lying-leg-curl", "leg-press-calf-raise", "custom-sled"].map((slug, i) => ({ id: `e${i}`, slug }));

  it("maps slugs to ids, best first, dropping unknown and repeated ones", () => {
    expect(matchedExerciseIds(["custom-sled", "made-up", "leg-press", "custom-sled"], library)).toEqual(["e6", "e0"]);
  });

  it("keeps at most five", () => {
    expect(matchedExerciseIds(library.map((e) => e.slug), library)).toHaveLength(5);
  });
});

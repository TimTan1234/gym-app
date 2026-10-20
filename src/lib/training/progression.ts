// Double progression: work within a rep range; once every working set hits
// the top of the range, add weight and drop back to the bottom.

export interface LastSet {
  weightKg: number;
  reps: number;
  isWarmup: boolean;
}

export interface ProgressionInput {
  lastSets: LastSet[];
  repMin: number;
  repMax: number;
  isLowerBody: boolean;
}

/** Why the suggestion was made; the UI turns it into a sentence in the user's language. */
export type SuggestionReason = { kind: "addWeight"; repMax: number; incKg: number } | { kind: "addReps"; target: number };

export interface Suggestion {
  weightKg: number;
  reps: number;
  reason: SuggestionReason;
}

export const UPPER_INCREMENT_KG = 2.5;
export const LOWER_INCREMENT_KG = 5;

export function suggestNext(input: ProgressionInput): Suggestion | null {
  const working = input.lastSets.filter((s) => !s.isWarmup && s.reps > 0);
  if (working.length === 0) return null;

  const topWeight = Math.max(...working.map((s) => s.weightKg));
  const atTop = working.filter((s) => s.weightKg === topWeight);
  const allHitTop = atTop.every((s) => s.reps >= input.repMax);

  if (allHitTop) {
    const inc = input.isLowerBody ? LOWER_INCREMENT_KG : UPPER_INCREMENT_KG;
    return {
      weightKg: topWeight + inc,
      reps: input.repMin,
      reason: { kind: "addWeight", repMax: input.repMax, incKg: inc },
    };
  }

  const minReps = Math.min(...atTop.map((s) => s.reps));
  const target = Math.min(input.repMax, Math.max(input.repMin, minReps + 1));
  return {
    weightKg: topWeight,
    reps: target,
    reason: { kind: "addReps", target },
  };
}

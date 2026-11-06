export const READINESS = ["TIRED", "NORMAL", "GREAT"] as const;
export type Readiness = (typeof READINESS)[number];

/**
 * Working sets for a planned exercise today, from how the user feels at the start.
 * Tired: about a third fewer sets. Great: one more set on compound lifts, where extra
 * volume pays off most. Normal, or no answer: the plan as written.
 */
export function setsForReadiness(planned: number, category: string | undefined, readiness: Readiness | null): number {
  if (readiness === "TIRED") return Math.max(1, Math.ceil((planned * 2) / 3));
  if (readiness === "GREAT" && category === "COMPOUND") return planned + 1;
  return planned;
}

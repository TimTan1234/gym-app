import { estimate1RM } from "./oneRepMax";

export interface SetLike {
  exerciseId: string;
  weightKg: number;
  reps: number;
  isWarmup: boolean;
}

/** Total working volume (kg × reps) for a list of sets. */
export function totalVolume(sets: SetLike[]): number {
  return Math.round(sets.filter((s) => !s.isWarmup).reduce((v, s) => v + s.weightKg * s.reps, 0));
}

/** Best estimated 1RM among working sets. */
export function best1RM(sets: SetLike[]): number {
  return sets.filter((s) => !s.isWarmup).reduce((m, s) => Math.max(m, estimate1RM(s.weightKg, s.reps)), 0);
}

export function durationMinutes(startedAt: Date, endedAt: Date | null): number | null {
  if (!endedAt) return null;
  return Math.max(1, Math.round((endedAt.getTime() - startedAt.getTime()) / 60000));
}

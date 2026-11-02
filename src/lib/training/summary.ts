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

/**
 * The exercise the next set belongs to: the one last logged until its target is met, then the next
 * planned one with sets to go. Exercises without a target count as done once they have a set.
 * Null once every exercise is done.
 */
export function currentExercise(
  exercises: { id: string; targetSets: number | null }[],
  sets: { exerciseId: string; isWarmup: boolean }[],
): string | null {
  const working = (id: string) => sets.filter((s) => s.exerciseId === id && !s.isWarmup).length;
  const open = (e: (typeof exercises)[number]) =>
    e.targetSets ? working(e.id) < e.targetSets : !sets.some((s) => s.exerciseId === e.id);
  const at = exercises.findIndex((e) => e.id === sets.at(-1)?.exerciseId);
  if (at >= 0 && (!exercises[at].targetSets || open(exercises[at]))) return exercises[at].id;
  const after = [...exercises.slice(at + 1), ...exercises.slice(0, at + 1)];
  return after.find(open)?.id ?? null;
}

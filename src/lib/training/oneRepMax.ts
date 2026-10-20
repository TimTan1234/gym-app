// Estimated one-rep max. Epley for most sets; reps > 12 are unreliable, so
// we cap the reps used for estimation.

const MAX_REPS_FOR_ESTIMATE = 12;

export function estimate1RM(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  if (reps === 1) return weightKg;
  const r = Math.min(reps, MAX_REPS_FOR_ESTIMATE);
  return Math.round(weightKg * (1 + r / 30) * 10) / 10;
}

export function setVolume(weightKg: number, reps: number): number {
  return weightKg * reps;
}

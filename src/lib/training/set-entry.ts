// What a set holds, by kind of exercise: a lift is weight × reps; a cardio set is time and
// distance, with weight and reps kept at 0 so it adds nothing to volume, e1RM or records.

import { inputDistanceToM, inputWeightToKg, type UnitSystem } from "../units";

export interface SetValues {
  weightKg: number;
  reps: number;
  rpe: number | null;
  isWarmup: boolean;
  durationSec: number | null;
  distanceM: number | null;
}

/** The fields of a set being typed, as the inputs hold them (weight and distance in the user's units). */
export interface SetEntry {
  weight: string;
  reps: string;
  rpe: string;
  minutes: string;
  distance: string;
  isWarmup: boolean;
}

/** Values to save from what was typed, or null when what the set needs is missing. */
export function parseSetEntry(entry: SetEntry, cardio: boolean, units: UnitSystem): SetValues | null {
  const rpe = entry.rpe ? Math.min(10, Math.max(1, Number(entry.rpe))) : null;
  if (rpe !== null && !Number.isFinite(rpe)) return null;
  if (cardio) {
    const minutes = Number(entry.minutes);
    const distance = entry.distance ? Number(entry.distance) : null;
    if (!Number.isFinite(minutes) || minutes <= 0) return null;
    if (distance !== null && (!Number.isFinite(distance) || distance < 0)) return null;
    return {
      weightKg: 0,
      reps: 0,
      rpe,
      isWarmup: entry.isWarmup,
      durationSec: Math.round(minutes * 60),
      distanceM: distance ? inputDistanceToM(distance, units) : null,
    };
  }
  const weight = Number(entry.weight || 0);
  const reps = Number(entry.reps);
  if (!Number.isFinite(weight) || weight < 0 || !Number.isInteger(reps) || reps <= 0) return null;
  return { weightKg: inputWeightToKg(weight, units), reps, rpe, isWarmup: entry.isWarmup, durationSec: null, distanceM: null };
}

/** The set as stored for its exercise's kind, or null when a cardio set has no time. */
export function setFields(
  cardio: boolean,
  s: { weightKg: number; reps: number; rpe: number | null; isWarmup: boolean; durationSec?: number | null; distanceM?: number | null },
): SetValues | null {
  if (cardio) {
    if (!s.durationSec) return null;
    return { weightKg: 0, reps: 0, rpe: s.rpe, isWarmup: s.isWarmup, durationSec: s.durationSec, distanceM: s.distanceM ?? null };
  }
  return { weightKg: s.weightKg, reps: s.reps, rpe: s.rpe, isWarmup: s.isWarmup, durationSec: null, distanceM: null };
}

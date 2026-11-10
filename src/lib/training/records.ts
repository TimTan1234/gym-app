// Personal-record detection. Pure function: given the new set and the
// current bests for that exercise, return which record types it beats.

import { estimate1RM, setVolume } from "./oneRepMax";

export type RecordType = "MAX_WEIGHT" | "EST_1RM" | "MAX_VOLUME_SET";

export type Bests = Partial<Record<RecordType, number>>;

export interface NewRecord {
  type: RecordType;
  value: number;
  previous: number | null;
}

export function detectRecords(
  set: { weightKg: number; reps: number; isWarmup: boolean },
  bests: Bests,
): NewRecord[] {
  if (set.isWarmup || set.reps <= 0 || set.weightKg <= 0) return [];

  const candidates: Record<RecordType, number> = {
    MAX_WEIGHT: set.weightKg,
    EST_1RM: estimate1RM(set.weightKg, set.reps),
    MAX_VOLUME_SET: setVolume(set.weightKg, set.reps),
  };

  const out: NewRecord[] = [];
  for (const type of Object.keys(candidates) as RecordType[]) {
    const prev = bests[type];
    if (prev === undefined || candidates[type] > prev) {
      out.push({ type, value: candidates[type], previous: prev ?? null });
    }
  }
  return out;
}

export interface RecordSet {
  id: string;
  weightKg: number;
  reps: number;
  isWarmup: boolean;
  completedAt: Date;
}

export interface EarnedRecord {
  setId: string;
  type: RecordType;
  value: number;
  achievedAt: Date;
}

/**
 * The records an exercise's sets earn when replayed in the order they were done: the same rows
 * logging them one by one saves. Rebuilding from the sets after an edit or delete keeps every
 * record backed by a set, and gives a later set back the record a removed one had taken.
 */
export function earnedRecords(sets: RecordSet[]): EarnedRecord[] {
  const bests: Bests = {};
  const out: EarnedRecord[] = [];
  for (const set of sets.toSorted((a, b) => a.completedAt.getTime() - b.completedAt.getTime())) {
    for (const r of detectRecords(set, bests)) {
      bests[r.type] = r.value;
      out.push({ setId: set.id, type: r.type, value: r.value, achievedAt: set.completedAt });
    }
  }
  return out;
}

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

export const RECORD_LABELS: Record<RecordType, string> = {
  MAX_WEIGHT: "Heaviest weight",
  EST_1RM: "Estimated 1RM",
  MAX_VOLUME_SET: "Best set volume",
};

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

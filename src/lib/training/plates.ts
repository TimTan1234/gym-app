// Which plates to load on each side of a barbell for a target weight.
// Works in the user's display unit (kg or lb) so plates match the gym's.

import type { UnitSystem } from "@/lib/units";

export interface PlateSetup {
  bar: number;
  /** Available plate sizes, largest first; assumed unlimited pairs of each. */
  plates: number[];
}

export const PLATE_SETUPS: Record<UnitSystem, PlateSetup & { bars: number[] }> = {
  METRIC: { bar: 20, bars: [20, 15, 10], plates: [25, 20, 15, 10, 5, 2.5, 1.25] },
  IMPERIAL: { bar: 45, bars: [45, 35, 25], plates: [45, 35, 25, 10, 5, 2.5] },
};

export interface PlateLoad {
  /** Plates for one side, largest first. */
  perSide: number[];
  /** Total that is actually loaded (bar + both sides). */
  loaded: number;
  /** Target minus loaded; > 0 when the target can't be made exactly. */
  short: number;
}

// Plate sizes are multiples of 0.25 kg/lb, so work in quarter units to avoid
// float remainders (e.g. 0.1 left over from 62.5 - 20 - 2×20 - 2×1.25).
const Q = 4;

/** Returns null when the target is at or below the bar weight. */
export function plateMath(target: number, setup: PlateSetup): PlateLoad | null {
  if (!Number.isFinite(target) || target <= setup.bar) return null;
  let side = Math.floor(((target - setup.bar) * Q) / 2 + 1e-9);
  const perSide: number[] = [];
  for (const plate of setup.plates) {
    const p = Math.round(plate * Q);
    while (side >= p) {
      perSide.push(plate);
      side -= p;
    }
  }
  const loaded = setup.bar + (2 * perSide.reduce((s, p) => s + Math.round(p * Q), 0)) / Q;
  return { perSide, loaded, short: Math.round((target - loaded) * 100) / 100 };
}

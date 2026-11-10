// Bench press form check, filmed from the side with the phone on the floor or a
// bench beside the lifter.
//
// Reps are counted on how high the wrists are above the shoulder, as a share of
// that height at lockout. Each rep starts and ends locked out.

import { LiftTracker, angleAt, clearerSide, type Frame, type Landmark, type LiftModel, type Rep } from "./pose";

export type BenchFault = "shallow" | "noLockout";

export interface BenchRep extends Rep {
  /** Wrist height at the bottom, as a share of the height at lockout. */
  bottomShare: number;
  /** Largest elbow angle as the rep finished, if seen. */
  lockoutDeg: number | null;
  faults: BenchFault[];
}

/** The bar stopping above 40% of its lockout height is a half rep; touching the chest leaves it near 20–30%. */
const SHALLOW_SHARE = 0.4;
/** Elbows still bent more than this at the top: not locked out. */
const LOCKOUT_DEG = 155;
/** Lockout comes just after the rep's end line, so the top is watched a little longer. */
const SETTLE_MS = 600;

interface Measures {
  /** Wrist above shoulder, in image heights. */
  signal: number;
  elbowDeg: number;
}

interface Stats {
  topElbow: number | null;
}

export const benchPress: LiftModel<Measures, Stats, Pick<BenchRep, "bottomShare" | "lockoutDeg" | "faults">> = {
  measure({ left, right }, view) {
    if (view !== "side") return null;
    const s = clearerSide(left, right, ["shoulder", "elbow", "wrist"]);
    if (!s) return null;
    return { signal: s.shoulder.y - s.wrist.y, elbowDeg: angleAt(s.shoulder, s.elbow, s.wrist) };
  },
  // Rest is locked out; travel is how much of the lockout height the bar has come down.
  reference: "max",
  travel: (height, top) => (top > 0 ? 1 - height / top : null),
  start: 0.2,
  end: 0.1,
  minTravel: 0.4,
  settleMs: SETTLE_MS,
  begin: () => ({ topElbow: null }),
  observe(s, m, travel) {
    if (travel < 0.1) s.topElbow = Math.max(s.topElbow ?? 0, m.elbowDeg);
  },
  grade(s, _view, maxTravel) {
    const bottomShare = 1 - maxTravel;
    const faults: BenchFault[] = [];
    if (bottomShare > SHALLOW_SHARE) faults.push("shallow");
    if (s.topElbow !== null && s.topElbow < LOCKOUT_DEG) faults.push("noLockout");
    return { bottomShare, lockoutDeg: s.topElbow, faults };
  },
};

export class BenchPressTracker {
  private tracker = new LiftTracker(benchPress);
  update(landmarks: Landmark[] | undefined, timestampMs: number, aspect: number): Frame<BenchRep> {
    return this.tracker.update(landmarks, timestampMs, aspect);
  }
}

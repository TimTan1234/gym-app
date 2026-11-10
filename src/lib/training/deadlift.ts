// Deadlift form check, filmed from the side.
//
// Reps are counted on the hip angle (shoulder–hip–knee): closed over the bar at
// the floor, near 180° at lockout. Each rep starts and ends at the floor.

import { LiftTracker, angleAt, clearerSide, fromVertical, type Frame, type Landmark, type LiftModel, type Rep } from "./pose";

export type DeadliftFault = "softLockout" | "hipsFirst";

export interface DeadliftRep extends Rep {
  /** Largest hip angle at the top. */
  lockoutDeg: number;
  /** How far the back angle fell toward horizontal in the first half of the pull. */
  backDropDeg: number;
  faults: DeadliftFault[];
}

/** Hip angles mapped to travel 0 and 1; reps start past 129° and end back under 124.5°. */
const FLOOR_DEG = 120;
const TOP_DEG = 165;
/** Hips open less than this at the top: not locked out. */
const LOCKOUT_DEG = 165;
/** The back flattening by more than this while the bar leaves the floor: the hips rose first. */
const HIPS_FIRST_DEG = 15;
/** The first half of the pull, by travel. */
const EARLY = 0.5;

interface Measures {
  /** Hip angle in degrees. */
  signal: number;
  /** Back angle above horizontal. */
  backDeg: number;
}

interface Stats {
  startBack: number;
  minBackEarly: number;
  early: boolean;
  maxHip: number;
}

export const deadlift: LiftModel<Measures, Stats, Pick<DeadliftRep, "lockoutDeg" | "backDropDeg" | "faults">> = {
  measure({ left, right }, view) {
    // From the front the hip angle is foreshortened out of sight.
    if (view !== "side") return null;
    const s = clearerSide(left, right, ["shoulder", "hip", "knee"]);
    if (!s) return null;
    return { signal: angleAt(s.shoulder, s.hip, s.knee), backDeg: 90 - fromVertical(s.shoulder, s.hip) };
  },
  // Not clamped below 0, so the start position is the deepest frame before the pull.
  travel: (hip) => (hip - FLOOR_DEG) / (TOP_DEG - FLOOR_DEG),
  start: 0.2,
  end: 0.1,
  minTravel: 0.7,
  begin: (since) => ({ startBack: since[0].backDeg, minBackEarly: Math.min(...since.map((m) => m.backDeg)), early: true, maxHip: 0 }),
  observe(s, m, travel) {
    s.maxHip = Math.max(s.maxHip, m.signal);
    if (travel >= EARLY) s.early = false;
    if (s.early) s.minBackEarly = Math.min(s.minBackEarly, m.backDeg);
  },
  grade(s) {
    const backDropDeg = Math.max(0, s.startBack - s.minBackEarly);
    const faults: DeadliftFault[] = [];
    if (s.maxHip < LOCKOUT_DEG) faults.push("softLockout");
    if (backDropDeg > HIPS_FIRST_DEG) faults.push("hipsFirst");
    return { lockoutDeg: s.maxHip, backDropDeg, faults };
  },
};

export class DeadliftTracker {
  private tracker = new LiftTracker(deadlift);
  update(landmarks: Landmark[] | undefined, timestampMs: number, aspect: number): Frame<DeadliftRep> {
    return this.tracker.update(landmarks, timestampMs, aspect);
  }
}

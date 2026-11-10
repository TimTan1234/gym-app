// Overhead press form check, from the side or the front.
//
// Reps are counted on how high the wrists are above the shoulder, as a share of
// arm length: near 0 in the rack position, near 1 locked out overhead. Each rep
// starts and ends in the rack position.

import { LiftTracker, MIN_VISIBILITY, angleAt, clearerSide, distance, fromVertical, type Frame, type Landmark, type LiftModel, type Rep } from "./pose";

export type PressFault = "noLockout" | "leanBack";

export interface PressRep extends Rep {
  /** Largest elbow angle at the top. */
  lockoutDeg: number;
  /** Largest torso angle from vertical (side view only). */
  leanDeg: number | null;
  faults: PressFault[];
}

/** Wrist heights (share of arm length) mapped to travel 0 and 1; reps start past 0.38 and end under 0.32. */
const RACK = 0.25;
const OVERHEAD = 0.9;
const LOCKOUT_DEG = 160;
/** A slight lean back clears the face; more than this turns the press into an incline press. */
const LEAN_DEG = 20;

interface Measures {
  /** Wrist above shoulder, as a share of arm length. */
  signal: number;
  elbowDeg: number;
  leanDeg: number | null;
}

interface Stats {
  maxElbow: number;
  maxLean: number | null;
}

export const overheadPress: LiftModel<Measures, Stats, Pick<PressRep, "lockoutDeg" | "leanDeg" | "faults">> = {
  measure({ left, right }, view) {
    const s = clearerSide(left, right, ["shoulder", "elbow", "wrist"]);
    if (!s) return null;
    const arm = distance(s.shoulder, s.elbow) + distance(s.elbow, s.wrist);
    if (arm === 0) return null;
    return {
      signal: (s.shoulder.y - s.wrist.y) / arm,
      elbowDeg: angleAt(s.shoulder, s.elbow, s.wrist),
      leanDeg: view === "side" && s.hip.v >= MIN_VISIBILITY ? fromVertical(s.shoulder, s.hip) : null,
    };
  },
  travel: (height) => (height - RACK) / (OVERHEAD - RACK),
  start: 0.2,
  end: 0.1,
  minTravel: 0.7,
  begin: () => ({ maxElbow: 0, maxLean: null }),
  observe(s, m) {
    s.maxElbow = Math.max(s.maxElbow, m.elbowDeg);
    if (m.leanDeg !== null) s.maxLean = Math.max(s.maxLean ?? 0, m.leanDeg);
  },
  grade(s, view) {
    const leanDeg = view === "side" ? s.maxLean : null;
    const faults: PressFault[] = [];
    if (s.maxElbow < LOCKOUT_DEG) faults.push("noLockout");
    if (leanDeg !== null && leanDeg > LEAN_DEG) faults.push("leanBack");
    return { lockoutDeg: s.maxElbow, leanDeg, faults };
  },
};

export class OverheadPressTracker {
  private tracker = new LiftTracker(overheadPress);
  update(landmarks: Landmark[] | undefined, timestampMs: number, aspect: number): Frame<PressRep> {
    return this.tracker.update(landmarks, timestampMs, aspect);
  }
}

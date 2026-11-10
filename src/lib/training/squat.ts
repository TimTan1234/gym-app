// Squat form check from pose landmarks.
//
// Reps are tracked with one signal that works from the side and the front:
// how far the hip sits above the knee, as a share of that gap when standing.
// 1 = standing, 0 = hip level with knee (parallel), < 0 = below parallel.
// That share is the sine of the thigh's angle above horizontal, so it also
// gives depth in degrees.

import { LiftTracker, MIN_VISIBILITY, clamp, clearerSide, deg, fromVertical, visibility, type Frame, type Landmark, type LiftModel, type Rep, type View } from "./pose";

export { LANDMARK, type Landmark, type View } from "./pose";

export type Phase = "top" | "down";
export type SquatFault = "shallow" | "kneesCave" | "forwardLean";

export interface SquatRep extends Rep {
  /** Thigh angle at the lowest point: above parallel is positive, below is negative. */
  thighAngleDeg: number;
  /** Smallest knee spacing ÷ ankle spacing in the bottom half (front view only). */
  kneeRatio: number | null;
  /** Largest torso angle from vertical in the bottom half (side view only). */
  torsoLeanDeg: number | null;
  faults: SquatFault[];
}

export interface SquatFrame {
  tracking: boolean;
  view: View;
  phase: Phase;
  /** Current thigh angle above horizontal, when tracking. */
  thighAngleDeg: number | null;
  /** Set on the frame a rep finishes. */
  rep: SquatRep | null;
}

/** Checks for knees and torso apply once the thigh is this far down (share of standing). */
const BOTTOM_HALF = 0.5;
/** Hip joint centre within ~3° of the knee counts as parallel. */
const PARALLEL_TOLERANCE = 0.05;
const KNEE_CAVE_RATIO = 0.9;
const FORWARD_LEAN_DEG = 55;

/** Thigh angle above horizontal for a hip-height share. */
export function thighAngle(share: number): number {
  return deg(Math.asin(clamp(share, -1, 1)));
}

/** A thigh angle at or below this counts as deep enough. */
export const PARALLEL_DEG = thighAngle(PARALLEL_TOLERANCE);

interface Measures {
  /** Hip above knee, in image heights. */
  signal: number;
  kneeRatio: number | null;
  torsoLeanDeg: number | null;
}

interface Stats {
  minKneeRatio: number | null;
  maxLean: number | null;
}

export const squat: LiftModel<Measures, Stats, Pick<SquatRep, "thighAngleDeg" | "kneeRatio" | "torsoLeanDeg" | "faults">> = {
  measure({ left: L, right: R }, view) {
    const leg = ["hip", "knee", "ankle"] as const;
    if (view === "front") {
      if (Math.min(visibility(L, [...leg]), visibility(R, [...leg])) < MIN_VISIBILITY) return null;
      const ankleSpan = Math.abs(L.ankle.x - R.ankle.x);
      return {
        signal: (L.knee.y + R.knee.y) / 2 - (L.hip.y + R.hip.y) / 2,
        kneeRatio: ankleSpan > 0 ? Math.abs(L.knee.x - R.knee.x) / ankleSpan : null,
        torsoLeanDeg: null,
      };
    }
    const s = clearerSide(L, R, [...leg]);
    if (!s) return null;
    return {
      signal: s.knee.y - s.hip.y,
      kneeRatio: null,
      torsoLeanDeg: view === "side" && s.shoulder.v >= MIN_VISIBILITY ? fromVertical(s.shoulder, s.hip) : null,
    };
  },
  // Rest is standing; travel is how much of the standing hip-above-knee gap is gone.
  reference: "max",
  travel: (gap, standing) => (standing > 0 ? 1 - gap / standing : null),
  // Starts below 80% of standing height, back up above 90%, and goes at least to 60%.
  start: 0.2,
  end: 0.1,
  minTravel: 0.4,
  begin: () => ({ minKneeRatio: null, maxLean: null }),
  observe(s, m, travel) {
    if (1 - travel >= BOTTOM_HALF) return;
    if (m.kneeRatio !== null) s.minKneeRatio = Math.min(s.minKneeRatio ?? Infinity, m.kneeRatio);
    if (m.torsoLeanDeg !== null) s.maxLean = Math.max(s.maxLean ?? 0, m.torsoLeanDeg);
  },
  grade(s, view, maxTravel) {
    const minShare = 1 - maxTravel;
    const kneeRatio = view === "front" ? s.minKneeRatio : null;
    const torsoLeanDeg = view === "side" ? s.maxLean : null;
    const faults: SquatFault[] = [];
    if (minShare > PARALLEL_TOLERANCE) faults.push("shallow");
    if (kneeRatio !== null && kneeRatio < KNEE_CAVE_RATIO) faults.push("kneesCave");
    if (torsoLeanDeg !== null && torsoLeanDeg > FORWARD_LEAN_DEG) faults.push("forwardLean");
    return { thighAngleDeg: thighAngle(minShare), kneeRatio, torsoLeanDeg, faults };
  },
};

/** Feed it every frame; it counts reps and grades each one as it finishes. */
export class SquatTracker {
  private tracker = new LiftTracker(squat);

  update(landmarks: Landmark[] | undefined, timestampMs: number, aspect: number): SquatFrame {
    const f: Frame<SquatRep> = this.tracker.update(landmarks, timestampMs, aspect);
    return {
      tracking: f.tracking,
      view: f.view,
      phase: f.moving ? "down" : "top",
      thighAngleDeg: f.travel === null ? null : thighAngle(1 - f.travel),
      rep: f.rep,
    };
  }
}

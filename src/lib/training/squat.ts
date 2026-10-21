// Squat form check from pose landmarks (MediaPipe Pose Landmarker layout).
// Pure maths with no MediaPipe import, so it runs in unit tests.
//
// Reps are tracked with one signal that works from the side and the front:
// how far the hip sits above the knee, as a share of that gap when standing.
// 1 = standing, 0 = hip level with knee (parallel), < 0 = below parallel.
// That share is the sine of the thigh's angle above horizontal, so it also
// gives depth in degrees.

/** A landmark in normalised image coordinates (0–1, y grows downward). */
export interface Landmark {
  x: number;
  y: number;
  visibility?: number;
}

export const LANDMARK = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

export type View = "side" | "front" | "unclear";
export type Phase = "top" | "down";
export type SquatFault = "shallow" | "kneesCave" | "forwardLean";

export interface SquatRep {
  /** 1-based. */
  index: number;
  durationMs: number;
  view: View;
  /** Thigh angle at the lowest point: above parallel is positive, below is negative. */
  thighAngleDeg: number;
  /** Smallest knee spacing ÷ ankle spacing in the bottom half (front view only). */
  kneeRatio: number | null;
  /** Largest torso angle from vertical in the bottom half (side view only). */
  torsoLeanDeg: number | null;
  faults: SquatFault[];
}

export interface SquatFrame {
  /** False when hips, knees or ankles aren't clearly in view. */
  tracking: boolean;
  view: View;
  phase: Phase;
  /** Current thigh angle above horizontal, when tracking. */
  thighAngleDeg: number | null;
  /** Set on the frame a rep finishes. */
  rep: SquatRep | null;
}

// Rep thresholds on the hip-height share. The gap between the two is the
// hysteresis that stops jitter around one line from counting extra reps.
const START_DOWN = 0.8;
const BACK_UP = 0.9;
/** A dip that never goes below this (thigh ~37° above horizontal) isn't a squat. */
const MIN_REP_DEPTH = 0.6;
/** Checks for knees and torso apply once the thigh is this far down. */
const BOTTOM_HALF = 0.5;
/** Hip joint centre within ~3° of the knee counts as parallel. */
const PARALLEL_TOLERANCE = 0.05;
const KNEE_CAVE_RATIO = 0.9;
const FORWARD_LEAN_DEG = 55;
const MIN_VISIBILITY = 0.5;
/** Standing height is the tallest gap seen in this window while at the top. */
const STANDING_WINDOW_MS = 2000;
const MIN_REP_MS = 400;
/** Lose the person for longer than this mid-rep and the rep is dropped. */
const LOST_MS = 2500;

const deg = (rad: number) => (rad * 180) / Math.PI;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Thigh angle above horizontal for a hip-height share. */
export function thighAngle(share: number): number {
  return deg(Math.asin(clamp(share, -1, 1)));
}

/** A thigh angle at or below this counts as deep enough. */
export const PARALLEL_DEG = thighAngle(PARALLEL_TOLERANCE);

/**
 * One Euro filter: smooths jitter while the value is still, follows quickly
 * when it moves. https://gery.casiez.net/1euro/
 */
export class OneEuroFilter {
  private x: number | null = null;
  private dx = 0;
  private t = 0;

  constructor(
    private minCutoff = 1.5,
    private beta = 0.5,
    private dCutoff = 1,
  ) {}

  filter(value: number, timestampMs: number): number {
    if (this.x === null) {
      this.x = value;
      this.t = timestampMs;
      return value;
    }
    const dt = Math.max(1e-3, (timestampMs - this.t) / 1000);
    this.t = timestampMs;
    const alpha = (cutoff: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
    const rawDx = (value - this.x) / dt;
    this.dx += alpha(this.dCutoff) * (rawDx - this.dx);
    this.x += alpha(this.minCutoff + this.beta * Math.abs(this.dx)) * (value - this.x);
    return this.x;
  }

  reset() {
    this.x = null;
    this.dx = 0;
  }
}

interface Measures {
  view: View;
  /** Hip above knee, in image heights (pixel space). */
  hipGap: number;
  kneeRatio: number | null;
  torsoLeanDeg: number | null;
}

/**
 * Pulls the measures out of one frame, or null if the lower body isn't
 * clearly visible. `aspect` is image width ÷ height, so angles use real pixels.
 */
export function measure(lm: Landmark[], aspect: number): Measures | null {
  const p = (i: number) => ({ x: lm[i].x * aspect, y: lm[i].y, v: lm[i].visibility ?? 1 });
  const L = { shoulder: p(LANDMARK.leftShoulder), hip: p(LANDMARK.leftHip), knee: p(LANDMARK.leftKnee), ankle: p(LANDMARK.leftAnkle) };
  const R = { shoulder: p(LANDMARK.rightShoulder), hip: p(LANDMARK.rightHip), knee: p(LANDMARK.rightKnee), ankle: p(LANDMARK.rightAnkle) };
  const legVis = (s: typeof L) => Math.min(s.hip.v, s.knee.v, s.ankle.v);

  // Shoulder width against torso length: wide from the front, narrow from the side.
  const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const torso = Math.hypot(mid(L.shoulder, R.shoulder).x - mid(L.hip, R.hip).x, mid(L.shoulder, R.shoulder).y - mid(L.hip, R.hip).y);
  if (torso === 0) return null;
  const width = Math.abs(L.shoulder.x - R.shoulder.x) / torso;
  const view: View = width > 0.45 ? "front" : width < 0.3 ? "side" : "unclear";

  if (view === "front") {
    if (Math.min(legVis(L), legVis(R)) < MIN_VISIBILITY) return null;
    const ankleSpan = Math.abs(L.ankle.x - R.ankle.x);
    return {
      view,
      hipGap: (L.knee.y + R.knee.y) / 2 - (L.hip.y + R.hip.y) / 2,
      kneeRatio: ankleSpan > 0 ? Math.abs(L.knee.x - R.knee.x) / ankleSpan : null,
      torsoLeanDeg: null,
    };
  }

  // From the side the far leg is hidden behind the near one; use the clearer side.
  const s = legVis(L) >= legVis(R) ? L : R;
  if (legVis(s) < MIN_VISIBILITY) return null;
  return {
    view,
    hipGap: s.knee.y - s.hip.y,
    kneeRatio: null,
    torsoLeanDeg: view === "side" && s.shoulder.v >= MIN_VISIBILITY ? deg(Math.atan2(Math.abs(s.shoulder.x - s.hip.x), s.hip.y - s.shoulder.y)) : null,
  };
}

/** Feed it every frame; it counts reps and grades each one as it finishes. */
export class SquatTracker {
  private phase: Phase = "top";
  private reps = 0;
  private gapFilter = new OneEuroFilter();
  private standing: { t: number; gap: number }[] = [];
  private standingGap = 0;
  private lastSeen = -Infinity;
  private rep: {
    start: number;
    minShare: number;
    minKneeRatio: number | null;
    maxLean: number | null;
    views: Record<View, number>;
  } | null = null;

  update(landmarks: Landmark[] | undefined, timestampMs: number, aspect: number): SquatFrame {
    const m = landmarks && landmarks.length > LANDMARK.rightAnkle ? measure(landmarks, aspect) : null;
    if (!m) {
      if (this.phase === "down" && timestampMs - this.lastSeen > LOST_MS) this.resetRep();
      return { tracking: false, view: "unclear", phase: this.phase, thighAngleDeg: null, rep: null };
    }
    if (timestampMs - this.lastSeen > LOST_MS) this.gapFilter.reset();
    this.lastSeen = timestampMs;
    const gap = this.gapFilter.filter(m.hipGap, timestampMs);

    if (this.phase === "top") {
      // Standing height adapts to the person moving nearer or further away.
      this.standing.push({ t: timestampMs, gap });
      this.standing = this.standing.filter((s) => timestampMs - s.t <= STANDING_WINDOW_MS);
      this.standingGap = Math.max(...this.standing.map((s) => s.gap));
    }
    if (this.standingGap <= 0) return { tracking: false, view: m.view, phase: this.phase, thighAngleDeg: null, rep: null };
    const share = gap / this.standingGap;

    let rep: SquatRep | null = null;
    if (this.phase === "top" && share < START_DOWN) {
      this.phase = "down";
      this.rep = { start: timestampMs, minShare: share, minKneeRatio: null, maxLean: null, views: { side: 0, front: 0, unclear: 0 } };
    } else if (this.phase === "down" && this.rep) {
      const r = this.rep;
      r.minShare = Math.min(r.minShare, share);
      r.views[m.view]++;
      if (share < BOTTOM_HALF) {
        if (m.kneeRatio !== null) r.minKneeRatio = Math.min(r.minKneeRatio ?? Infinity, m.kneeRatio);
        if (m.torsoLeanDeg !== null) r.maxLean = Math.max(r.maxLean ?? 0, m.torsoLeanDeg);
      }
      if (share > BACK_UP) {
        if (r.minShare < MIN_REP_DEPTH && timestampMs - r.start >= MIN_REP_MS) rep = this.finishRep(timestampMs);
        this.resetRep();
      }
    }
    return { tracking: true, view: m.view, phase: this.phase, thighAngleDeg: thighAngle(share), rep };
  }

  private finishRep(timestampMs: number): SquatRep {
    const r = this.rep!;
    const views = Object.entries(r.views) as [View, number][];
    const view = views.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
    const kneeRatio = view === "front" ? r.minKneeRatio : null;
    const torsoLeanDeg = view === "side" ? r.maxLean : null;
    const faults: SquatFault[] = [];
    if (r.minShare > PARALLEL_TOLERANCE) faults.push("shallow");
    if (kneeRatio !== null && kneeRatio < KNEE_CAVE_RATIO) faults.push("kneesCave");
    if (torsoLeanDeg !== null && torsoLeanDeg > FORWARD_LEAN_DEG) faults.push("forwardLean");
    return { index: ++this.reps, durationMs: timestampMs - r.start, view, thighAngleDeg: thighAngle(r.minShare), kneeRatio, torsoLeanDeg, faults };
  }

  private resetRep() {
    this.phase = "top";
    this.rep = null;
  }
}

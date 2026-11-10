// Shared pieces of the form checks: pose landmarks (MediaPipe Pose Landmarker
// layout), smoothing, camera-angle detection and a rep counter that each lift
// drives with one signal. Pure maths with no MediaPipe import, so it runs in unit tests.

/** A landmark in normalised image coordinates (0–1, y grows downward). */
export interface Landmark {
  x: number;
  y: number;
  visibility?: number;
}

export const LANDMARK = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

export type View = "side" | "front" | "unclear";

export const MIN_VISIBILITY = 0.5;

export const deg = (rad: number) => (rad * 180) / Math.PI;
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

type XY = { x: number; y: number };

/** A landmark in pixel-proportional space (x scaled by width ÷ height), so angles are true. */
export interface Point extends XY {
  v: number;
}

export type Joint = "shoulder" | "elbow" | "wrist" | "hip" | "knee" | "ankle";
export type BodySide = Record<Joint, Point>;

export function bodySides(lm: Landmark[], aspect: number): { left: BodySide; right: BodySide } {
  const p = (i: number): Point => ({ x: lm[i].x * aspect, y: lm[i].y, v: lm[i].visibility ?? 1 });
  const side = (s: "left" | "right"): BodySide => {
    const k = (j: string) => LANDMARK[`${s}${j}` as keyof typeof LANDMARK];
    return { shoulder: p(k("Shoulder")), elbow: p(k("Elbow")), wrist: p(k("Wrist")), hip: p(k("Hip")), knee: p(k("Knee")), ankle: p(k("Ankle")) };
  };
  return { left: side("left"), right: side("right") };
}

export const visibility = (s: BodySide, joints: Joint[]) => Math.min(...joints.map((j) => s[j].v));

/** The side whose `joints` are clearer, if they are clear enough: from the side the far one is hidden. */
export function clearerSide(left: BodySide, right: BodySide, joints: Joint[]): BodySide | null {
  const s = visibility(left, joints) >= visibility(right, joints) ? left : right;
  return visibility(s, joints) >= MIN_VISIBILITY ? s : null;
}

const mid = (a: XY, b: XY) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Shoulder width against torso length: wide from the front, narrow from the side. Null with no torso. */
export function viewOf(left: BodySide, right: BodySide): View | null {
  const s = mid(left.shoulder, right.shoulder);
  const h = mid(left.hip, right.hip);
  const torso = Math.hypot(s.x - h.x, s.y - h.y);
  if (torso === 0) return null;
  const width = Math.abs(left.shoulder.x - right.shoulder.x) / torso;
  return width > 0.45 ? "front" : width < 0.3 ? "side" : "unclear";
}

/** The angle at `b` between `a` and `c`, in degrees (180 = straight). */
export function angleAt(a: XY, b: XY, c: XY): number {
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const n = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
  return n === 0 ? 180 : deg(Math.acos(clamp((v1.x * v2.x + v1.y * v2.y) / n, -1, 1)));
}

/** How far the line from `lower` up to `upper` leans from vertical, in degrees. */
export function fromVertical(upper: XY, lower: XY): number {
  return deg(Math.atan2(Math.abs(upper.x - lower.x), lower.y - upper.y));
}

export const distance = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y);

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

/** What a lift reads from one frame: its rep signal, plus whatever its checks need. */
export interface Measures {
  signal: number;
}

/**
 * One lift's form check. Reps are counted on `travel`: how far the lifter is from
 * the position each rep starts and ends in, 0 there and 1 at the far end.
 */
export interface LiftModel<M extends Measures, S, G> {
  /** The frame's measures, or null when the joints this lift needs aren't clearly in view. */
  measure(body: { left: BodySide; right: BodySide }, view: View): M | null;
  /**
   * Turns the smoothed signal into travel. With `reference: "max"`, `ref` is the largest
   * signal seen at rest lately, so the scale adapts to the lifter's distance from the camera.
   */
  reference?: "max";
  travel(signal: number, ref: number): number | null;
  /** Rep thresholds on travel; the gap between start and end stops jitter from counting extra reps. */
  start?: number;
  end?: number;
  /** A rep must get at least this far. */
  minTravel?: number;
  /** Keep watching this long after a rep ends, for a check made at its finish. */
  settleMs?: number;
  /** `since`: the frames from the one nearest the start position up to the rep's start, oldest first. */
  begin(since: M[]): S;
  observe(stats: S, m: M, travel: number): void;
  grade(stats: S, view: View, maxTravel: number): G;
}

export interface Rep {
  /** 1-based. */
  index: number;
  durationMs: number;
  /** The camera angle seen most during the rep. */
  view: View;
}

export interface Frame<R> {
  /** False when the joints the lift needs aren't clearly in view. */
  tracking: boolean;
  view: View;
  /** True from a rep's start until it ends. */
  moving: boolean;
  travel: number | null;
  /** Set on the frame a rep is graded. */
  rep: R | null;
}

const MIN_REP_MS = 400;
/** Lose the person for longer than this mid-rep and the rep is dropped. */
const LOST_MS = 2500;
/** The adaptive reference is the largest signal seen in this window while at rest. */
const REFERENCE_WINDOW_MS = 2000;
/** Frames kept from the start position on (about 10 s). */
const MAX_SINCE = 300;

/** Feed it every frame; it counts reps and grades each one as it finishes. */
export class LiftTracker<M extends Measures, S, G> {
  private moving = false;
  /** Reps start only after the lifter has been seen in the start position. */
  private armed = false;
  private reps = 0;
  private filter = new OneEuroFilter();
  private window: { t: number; s: number }[] = [];
  private ref = 0;
  private lastSeen = -Infinity;
  /** The frame nearest the start position since the last rep, and the frames after it. */
  private rest: { travel: number; since: M[] } | null = null;
  private rep: { start: number; end: number; maxTravel: number; stats: S; views: Record<View, number>; settleUntil: number | null } | null = null;

  constructor(private model: LiftModel<M, S, G>) {}

  update(landmarks: Landmark[] | undefined, timestampMs: number, aspect: number): Frame<Rep & G> {
    const { start = 0.2, end = 0.1, minTravel = 0.4 } = this.model;
    const sides = landmarks && landmarks.length > LANDMARK.rightAnkle ? bodySides(landmarks, aspect) : null;
    const view = (sides && viewOf(sides.left, sides.right)) ?? "unclear";
    const m = sides && this.model.measure(sides, view);
    if (!m) {
      let rep: (Rep & G) | null = null;
      if (this.rep?.settleUntil != null) rep = this.finish();
      else if (this.moving && timestampMs - this.lastSeen > LOST_MS) this.drop();
      return { tracking: false, view, moving: this.moving, travel: null, rep };
    }
    if (timestampMs - this.lastSeen > LOST_MS) this.filter.reset();
    this.lastSeen = timestampMs;
    const signal = this.filter.filter(m.signal, timestampMs);

    if (this.model.reference && !this.moving) {
      this.window.push({ t: timestampMs, s: signal });
      this.window = this.window.filter((w) => timestampMs - w.t <= REFERENCE_WINDOW_MS);
      this.ref = Math.max(...this.window.map((w) => w.s));
    }
    const travel = this.model.travel(signal, this.ref);
    if (travel === null) return { tracking: false, view, moving: this.moving, travel: null, rep: null };

    let rep: (Rep & G) | null = null;
    const r = this.rep;
    if (r && r.settleUntil !== null) {
      this.model.observe(r.stats, m, travel);
      if (timestampMs >= r.settleUntil || travel > start) rep = this.finish();
    }
    if (!this.moving) {
      if (travel < end) this.armed = true;
      if (this.armed && !this.rep && travel > start) {
        this.moving = true;
        this.rep = {
          start: timestampMs,
          end: timestampMs,
          maxTravel: travel,
          stats: this.model.begin([...(this.rest?.since ?? []), m]),
          views: { side: 0, front: 0, unclear: 0 },
          settleUntil: null,
        };
        this.rest = null;
      } else if (!this.rest || travel <= this.rest.travel) {
        this.rest = { travel, since: [m] };
      } else if (this.rest.since.length < MAX_SINCE) {
        this.rest.since.push(m);
      }
    } else if (this.rep) {
      const r = this.rep;
      r.maxTravel = Math.max(r.maxTravel, travel);
      r.views[view]++;
      this.model.observe(r.stats, m, travel);
      if (travel < end) {
        this.moving = false;
        this.rest = { travel, since: [m] };
        if (r.maxTravel >= minTravel && timestampMs - r.start >= MIN_REP_MS) {
          r.end = timestampMs;
          if (this.model.settleMs) r.settleUntil = timestampMs + this.model.settleMs;
          else rep = this.finish();
        } else {
          this.rep = null;
        }
      }
    }
    return { tracking: true, view, moving: this.moving, travel, rep };
  }

  private finish(): Rep & G {
    const r = this.rep!;
    this.rep = null;
    const views = Object.entries(r.views) as [View, number][];
    const view = views.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
    return { index: ++this.reps, durationMs: r.end - r.start, view, ...this.model.grade(r.stats, view, r.maxTravel) };
  }

  private drop() {
    this.moving = false;
    this.rep = null;
  }
}

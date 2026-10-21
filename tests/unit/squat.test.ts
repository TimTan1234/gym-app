import { describe, expect, it } from "vitest";
import { LANDMARK, SquatTracker, thighAngle, type Landmark, type SquatRep } from "@/lib/training/squat";

const THIGH = 0.2;
const TORSO = 0.3;

function blank(): Landmark[] {
  return Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }));
}

/** Side-on squatter facing right; `share` is hip height above knee as a share of standing. */
function side(share: number, leanDeg = 20, visibility = 0.9): Landmark[] {
  const lm = blank();
  const knee = { x: 0.55, y: 0.7 };
  const hip = { x: knee.x - THIGH * Math.sqrt(1 - Math.min(1, share * share)), y: knee.y - THIGH * share };
  const lean = (leanDeg * Math.PI) / 180;
  const shoulder = { x: hip.x + TORSO * Math.sin(lean), y: hip.y - TORSO * Math.cos(lean) };
  // Near (left) side clear, far side mostly hidden.
  for (const [i, p, v] of [
    [LANDMARK.leftShoulder, shoulder, visibility],
    [LANDMARK.leftHip, hip, visibility],
    [LANDMARK.leftKnee, knee, visibility],
    [LANDMARK.leftAnkle, { x: 0.5, y: 0.9 }, visibility],
    [LANDMARK.rightShoulder, shoulder, 0.3],
    [LANDMARK.rightHip, hip, 0.3],
    [LANDMARK.rightKnee, knee, 0.3],
    [LANDMARK.rightAnkle, { x: 0.5, y: 0.9 }, 0.3],
  ] as const) lm[i] = { ...p, visibility: v };
  return lm;
}

/** Facing the camera; `kneeHalf` is each knee's distance from the midline (ankles sit at 0.08). */
function front(share: number, kneeHalf = 0.1): Landmark[] {
  const lm = blank();
  const hipY = 0.7 - THIGH * share;
  const set = (i: number, x: number, y: number) => (lm[i] = { x, y, visibility: 0.9 });
  set(LANDMARK.leftShoulder, 0.6, hipY - TORSO);
  set(LANDMARK.rightShoulder, 0.4, hipY - TORSO);
  set(LANDMARK.leftHip, 0.55, hipY);
  set(LANDMARK.rightHip, 0.45, hipY);
  set(LANDMARK.leftKnee, 0.5 + kneeHalf, 0.7);
  set(LANDMARK.rightKnee, 0.5 - kneeHalf, 0.7);
  set(LANDMARK.leftAnkle, 0.58, 0.9);
  set(LANDMARK.rightAnkle, 0.42, 0.9);
  return lm;
}

const FRAME_MS = 1000 / 30;

/** Stand, descend to `bottom`, hold, rise, stand: a list of hip-height shares at 30 fps. */
function squat(bottom: number): number[] {
  const ramp = (from: number, to: number, ms: number) => Array.from({ length: Math.round(ms / FRAME_MS) }, (_, i) => from + ((to - from) * (i + 1)) / Math.round(ms / FRAME_MS));
  return [...ramp(1, 1, 1000), ...ramp(1, bottom, 700), ...ramp(bottom, bottom, 300), ...ramp(bottom, 1, 700), ...ramp(1, 1, 500)];
}

function run(frames: Landmark[][]): SquatRep[] {
  const tracker = new SquatTracker();
  return frames.flatMap((lm, i) => tracker.update(lm, i * FRAME_MS, 1).rep ?? []);
}

/** Deterministic noise in [-1, 1]. */
function noise(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
}

describe("thighAngle", () => {
  it("is the angle above horizontal for a hip-height share", () => {
    expect(thighAngle(0)).toBeCloseTo(0);
    expect(thighAngle(0.5)).toBeCloseTo(30);
    expect(thighAngle(-0.5)).toBeCloseTo(-30);
    expect(thighAngle(1.2)).toBeCloseTo(90);
  });
});

describe("SquatTracker", () => {
  it("counts a below-parallel rep from the side with no faults", () => {
    const reps = run(squat(-0.2).map((s) => side(s)));
    expect(reps).toHaveLength(1);
    expect(reps[0]).toMatchObject({ index: 1, view: "side", faults: [] });
    expect(reps[0].thighAngleDeg).toBeLessThan(0);
    expect(reps[0].torsoLeanDeg).toBeCloseTo(20, 0);
  });

  it("flags a rep that stops above parallel and says by how much", () => {
    const [rep] = run(squat(0.3).map((s) => side(s)));
    expect(rep.faults).toEqual(["shallow"]);
    expect(rep.thighAngleDeg).toBeGreaterThan(10);
    expect(rep.thighAngleDeg).toBeLessThan(25);
  });

  it("ignores a small dip", () => {
    expect(run(squat(0.7).map((s) => side(s)))).toEqual([]);
  });

  it("counts each rep once despite jitter and a wobble near the top", () => {
    const rand = noise(42);
    // A slow wobble across the rep lines, like resetting the bar between reps.
    const wobble = Array.from({ length: 36 }, (_, i) => 0.85 + 0.08 * Math.sin((i * FRAME_MS * 2 * Math.PI) / 400));
    const shares = [...squat(-0.1), ...wobble, ...squat(-0.1), ...squat(0)].map((s) => s + rand() * 0.06);
    const reps = run(shares.map((s) => side(s)));
    expect(reps.map((r) => r.index)).toEqual([1, 2, 3]);
  });

  it("flags knees caving in from the front", () => {
    const shares = squat(-0.1);
    const caving = run(shares.map((s) => front(s, s < 0.5 ? 0.06 : 0.09)));
    expect(caving).toHaveLength(1);
    expect(caving[0].view).toBe("front");
    expect(caving[0].faults).toEqual(["kneesCave"]);
    expect(caving[0].kneeRatio).toBeCloseTo(0.75);

    const tracking = run(shares.map((s) => front(s, 0.09)));
    expect(tracking[0].faults).toEqual([]);
    expect(tracking[0].torsoLeanDeg).toBeNull();
  });

  it("flags a lot of forward lean from the side", () => {
    const [rep] = run(squat(-0.1).map((s) => side(s, s < 0.5 ? 65 : 20)));
    expect(rep.faults).toEqual(["forwardLean"]);
  });

  it("stops tracking when the legs aren't clearly visible", () => {
    const tracker = new SquatTracker();
    expect(tracker.update(side(1, 20, 0.2), 0, 1).tracking).toBe(false);
    expect(tracker.update(undefined, FRAME_MS, 1).tracking).toBe(false);
    expect(tracker.update(side(1), 2 * FRAME_MS, 1)).toMatchObject({ tracking: true, view: "side", phase: "top" });
  });
});

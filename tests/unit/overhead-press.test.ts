import { describe, expect, it } from "vitest";
import { OverheadPressTracker } from "@/lib/training/overhead-press";
import { arm, facing, heightForElbow, ramp, run, sideOn, toward } from "./pose-figures";

const HALF = 0.12;
const RACK = 0.03;
const SHOULDER = { x: 0.5, y: 0.4 };

/** Standing side on, wrists `height` above the shoulder, torso `lean` degrees back from vertical. */
function side(height: number, lean = 0) {
  const hip = toward(SHOULDER, 0.3, 180 - lean);
  return sideOn({ shoulder: SHOULDER, hip, knee: { x: hip.x, y: hip.y + 0.2 }, ankle: { x: hip.x, y: hip.y + 0.4 }, ...arm(SHOULDER, HALF, height) });
}

/** Facing the camera, both arms mirrored. */
function front(height: number) {
  const { elbow, wrist } = arm(SHOULDER, HALF, height);
  return facing({ shoulder: SHOULDER, elbow, wrist, hip: { x: 0.5, y: 0.7 }, knee: { x: 0.5, y: 0.9 }, ankle: { x: 0.5, y: 1.05 } }, { shoulder: 0.1, elbow: 0.12, wrist: 0.1 });
}

/** From the rack up to an elbow angle of `topDeg` and back, leaning back to `lean` on the way up. */
function press(topDeg = 180, lean = 0, view: typeof side | typeof front = side) {
  const top = heightForElbow(HALF, topDeg);
  const up = ramp(RACK, top, 700);
  const leanAt = (i: number) => (lean * Math.min(1, (i + 1) / up.length));
  return [
    ...up.map((h, i) => (view === side ? side(h, leanAt(i)) : front(h))),
    ...ramp(top, top, 200).map((h) => (view === side ? side(h, lean) : front(h))),
    ...ramp(top, RACK, 700).map((h) => (view === side ? side(h) : front(h))),
    ...ramp(RACK, RACK, 500).map((h) => (view === side ? side(h) : front(h))),
  ];
}
const racked = () => ramp(RACK, RACK, 800).map((h) => side(h));

describe("OverheadPressTracker", () => {
  it("counts locked-out presses from the side", () => {
    const reps = run(new OverheadPressTracker(), [...racked(), ...press(), ...press(180, 8)]);
    expect(reps.map((r) => r.index)).toEqual([1, 2]);
    expect(reps.every((r) => r.faults.length === 0)).toBe(true);
    expect(reps[1].leanDeg).toBeCloseTo(8, 0);
  });

  it("flags a press that stops short of lockout", () => {
    const [r] = run(new OverheadPressTracker(), [...racked(), ...press(145)]);
    expect(r.faults).toEqual(["noLockout"]);
  });

  it("flags leaning back from the side", () => {
    const [r] = run(new OverheadPressTracker(), [...racked(), ...press(180, 30)]);
    expect(r.faults).toEqual(["leanBack"]);
  });

  it("counts from the front, where lean isn't judged", () => {
    const reps = run(new OverheadPressTracker(), [...ramp(RACK, RACK, 800).map(front), ...press(180, 0, front)]);
    expect(reps).toHaveLength(1);
    expect(reps[0]).toMatchObject({ view: "front", leanDeg: null, faults: [] });
  });

  it("does not count lifting the bar from the floor to the rack", () => {
    const hanging = ramp(-0.24, -0.24, 600).map((h) => side(h));
    const clean = ramp(-0.24, RACK, 600).map((h) => side(h));
    expect(run(new OverheadPressTracker(), [...hanging, ...clean, ...racked()])).toEqual([]);
  });
});

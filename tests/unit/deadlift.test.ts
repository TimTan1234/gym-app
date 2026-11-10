import { describe, expect, it } from "vitest";
import { DeadliftTracker } from "@/lib/training/deadlift";
import { angleAt } from "@/lib/training/pose";
import { facing, ramp, run, sideOn, toward } from "./pose-figures";

const KNEE = { x: 0.5, y: 0.75 };
const ANKLE = { x: 0.5, y: 0.95 };

/** Side on, facing +x: `thigh` degrees from vertical, back `back` degrees above horizontal. */
function pose(thigh: number, back: number) {
  const hip = toward(KNEE, 0.2, -thigh);
  const shoulder = toward(hip, 0.3, 90 - back);
  return { shoulder, hip, knee: KNEE, ankle: ANKLE };
}

/** A pull from the floor (thigh 70°, back 40°) through `mid` (thigh 35°) to `top`, and back down. */
function pull(midBack: number, top: { thigh: number; back: number } = { thigh: 0, back: 90 }) {
  const up = [...ramp(70, 35, 500).map((t, i, a) => [t, 40 + ((midBack - 40) * (i + 1)) / a.length]), ...ramp(35, top.thigh, 500).map((t, i, a) => [t, midBack + ((top.back - midBack) * (i + 1)) / a.length])];
  const hold = Array.from({ length: 10 }, () => [top.thigh, top.back]);
  const down = ramp(top.thigh, 70, 800).map((t, i, a) => [t, top.back + ((40 - top.back) * (i + 1)) / a.length]);
  return [...up, ...hold, ...down, ...Array.from({ length: 15 }, () => [70, 40])].map(([t, b]) => sideOn(pose(t, b)));
}

/** Walk in standing, then set up over the bar and hold. */
const setUp = () => [...Array.from({ length: 30 }, () => [0, 90]), ...ramp(0, 70, 800).map((t, i, a) => [t, 90 - (50 * (i + 1)) / a.length]), ...Array.from({ length: 15 }, () => [70, 40])].map(([t, b]) => sideOn(pose(t, b)));

describe("DeadliftTracker", () => {
  it("measures the hip angle from the figure", () => {
    const p = pose(70, 40);
    expect(angleAt(p.shoulder, p.hip, p.knee)).toBeCloseTo(60, 0);
  });

  it("counts a clean rep and nothing for walking in and setting up", () => {
    const reps = run(new DeadliftTracker(), [...setUp(), ...pull(40), ...pull(42)]);
    expect(reps.map((r) => r.index)).toEqual([1, 2]);
    expect(reps[0].faults).toEqual([]);
    expect(reps[0].lockoutDeg).toBeGreaterThan(175);
  });

  it("flags hips rising before the shoulders", () => {
    const [rep] = run(new DeadliftTracker(), [...setUp(), ...pull(18)]);
    expect(rep.faults).toEqual(["hipsFirst"]);
    expect(rep.backDropDeg).toBeGreaterThan(15);
  });

  it("flags a soft lockout", () => {
    const [rep] = run(new DeadliftTracker(), [...setUp(), ...pull(40, { thigh: 0, back: 70 })]);
    expect(rep.faults).toEqual(["softLockout"]);
    expect(rep.lockoutDeg).toBeCloseTo(160, 0);
  });

  it("only tracks side on", () => {
    const front = facing(pose(0, 90), { shoulder: 0.1, hip: 0.05, knee: 0.05, ankle: 0.05 });
    expect(new DeadliftTracker().update(front, 0, 1)).toMatchObject({ tracking: false, view: "front" });
  });
});

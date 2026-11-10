import { describe, expect, it } from "vitest";
import { BenchPressTracker } from "@/lib/training/bench-press";
import { arm, heightForElbow, ramp, run, sideOn } from "./pose-figures";

const SHOULDER = { x: 0.5, y: 0.6 };
const HALF = 0.15;
const LOCKED = heightForElbow(HALF, 180);

/** Lying side on to the camera, the wrists `height` above the shoulder. */
const pose = (height: number) => sideOn({ shoulder: SHOULDER, hip: { x: 0.8, y: 0.62 }, knee: { x: 1, y: 0.55 }, ankle: { x: 1.1, y: 0.7 }, ...arm(SHOULDER, HALF, height) });

/** Locked out, down to `bottom` (share of lockout height), back up to an elbow angle of `topDeg`. */
function rep(bottom: number, topDeg = 180) {
  const top = heightForElbow(HALF, topDeg);
  return [...ramp(LOCKED, LOCKED * bottom, 800), ...ramp(LOCKED * bottom, LOCKED * bottom, 200), ...ramp(LOCKED * bottom, top, 800), ...ramp(top, top, 900)].map(pose);
}
const hold = () => ramp(LOCKED, LOCKED, 1000).map(pose);

describe("BenchPressTracker", () => {
  it("counts reps touched to the chest and locked out", () => {
    const reps = run(new BenchPressTracker(), [...hold(), ...rep(0.25), ...rep(0.2)]);
    expect(reps.map((r) => r.index)).toEqual([1, 2]);
    expect(reps[0].faults).toEqual([]);
    expect(reps[0].bottomShare).toBeLessThan(0.3);
    expect(reps[0].lockoutDeg).toBeGreaterThan(175);
  });

  it("flags a half rep", () => {
    const [r] = run(new BenchPressTracker(), [...hold(), ...rep(0.55)]);
    expect(r.faults).toEqual(["shallow"]);
  });

  it("flags elbows not locked out at the top", () => {
    const [r] = run(new BenchPressTracker(), [...hold(), ...rep(0.25, 140)]);
    expect(r.faults).toEqual(["noLockout"]);
    expect(r.lockoutDeg).toBeCloseTo(140, 0);
  });

  it("ignores a small dip", () => {
    expect(run(new BenchPressTracker(), [...hold(), ...rep(0.75)])).toEqual([]);
  });
});

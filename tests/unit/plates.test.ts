import { describe, expect, it } from "vitest";
import { PLATE_SETUPS, plateMath } from "@/lib/training/plates";

const kg = PLATE_SETUPS.METRIC;
const lb = PLATE_SETUPS.IMPERIAL;

describe("plateMath", () => {
  it("returns null at or below the bar", () => {
    expect(plateMath(20, kg)).toBeNull();
    expect(plateMath(15, kg)).toBeNull();
    expect(plateMath(Number.NaN, kg)).toBeNull();
  });

  it("loads the largest plates first", () => {
    expect(plateMath(100, kg)).toEqual({ perSide: [25, 15], loaded: 100, short: 0 });
    expect(plateMath(142.5, kg)?.perSide).toEqual([25, 25, 10, 1.25]);
  });

  it("handles fractional plates without float drift", () => {
    expect(plateMath(62.5, kg)).toEqual({ perSide: [20, 1.25], loaded: 62.5, short: 0 });
    expect(plateMath(22.5, kg)).toEqual({ perSide: [1.25], loaded: 22.5, short: 0 });
  });

  it("reports what's short when the weight can't be made exactly", () => {
    expect(plateMath(61, kg)).toEqual({ perSide: [20], loaded: 60, short: 1 });
    expect(plateMath(21, kg)).toEqual({ perSide: [], loaded: 20, short: 1 });
  });

  it("works in pounds with a 45 lb bar", () => {
    expect(plateMath(225, lb)?.perSide).toEqual([45, 45]);
    expect(plateMath(185, lb)?.perSide).toEqual([45, 25]);
    expect(plateMath(140, lb)?.perSide).toEqual([45, 2.5]);
  });

  it("respects a lighter bar", () => {
    expect(plateMath(35, { ...kg, bar: 15 })?.perSide).toEqual([10]);
  });
});

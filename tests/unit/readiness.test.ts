import { describe, expect, it } from "vitest";
import { setsForReadiness } from "@/lib/training/readiness";

describe("setsForReadiness", () => {
  it("keeps the plan when feeling normal or not asked", () => {
    expect(setsForReadiness(4, "COMPOUND", "NORMAL")).toBe(4);
    expect(setsForReadiness(3, "ISOLATION", null)).toBe(3);
  });

  it("drops about a third of the sets when tired, never below one", () => {
    expect([1, 2, 3, 4, 5, 6].map((n) => setsForReadiness(n, "COMPOUND", "TIRED"))).toEqual([1, 2, 2, 3, 4, 4]);
  });

  it("adds one set to compound lifts only when feeling great", () => {
    expect(setsForReadiness(4, "COMPOUND", "GREAT")).toBe(5);
    expect(setsForReadiness(3, "ISOLATION", "GREAT")).toBe(3);
    expect(setsForReadiness(3, undefined, "GREAT")).toBe(3);
  });
});

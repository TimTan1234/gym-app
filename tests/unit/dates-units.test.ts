import { describe, expect, it } from "vitest";
import { addDays, ageOn, dateRange, isLocalDate, startOfWeek, toLocalDate } from "@/lib/dates";
import { displayWeight, inputWeightToKg, formatHeight } from "@/lib/units";

describe("toLocalDate", () => {
  // 2026-10-19T20:30Z is already Oct 20 in Kuala Lumpur (UTC+8)
  const instant = new Date("2026-10-19T20:30:00Z");
  it("buckets by the user's timezone, not UTC", () => {
    expect(toLocalDate(instant, "Asia/Kuala_Lumpur")).toBe("2026-10-20");
    expect(toLocalDate(instant, "UTC")).toBe("2026-10-19");
    expect(toLocalDate(instant, "America/Los_Angeles")).toBe("2026-10-19");
  });
});

describe("date arithmetic", () => {
  it("adds days across month and DST boundaries", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });
  it("builds inclusive ranges and week starts", () => {
    expect(dateRange("2026-10-18", "2026-10-20")).toEqual(["2026-10-18", "2026-10-19", "2026-10-20"]);
    expect(startOfWeek("2026-10-20")).toBe("2026-10-19"); // Tuesday → Monday
    expect(startOfWeek("2026-10-25")).toBe("2026-10-19"); // Sunday → Monday
  });
  it("validates dates", () => {
    expect(isLocalDate("2026-02-29")).toBe(false);
    expect(isLocalDate("2028-02-29")).toBe(true);
    expect(isLocalDate("2026-1-1")).toBe(false);
  });
  it("computes age", () => {
    expect(ageOn(new Date("1996-10-21T00:00:00Z"), "2026-10-20")).toBe(29);
    expect(ageOn(new Date("1996-10-20T00:00:00Z"), "2026-10-20")).toBe(30);
  });
});

describe("units", () => {
  it("round-trips weights", () => {
    expect(displayWeight(100, "IMPERIAL")).toBe(220.5);
    expect(inputWeightToKg(220.462, "IMPERIAL")).toBeCloseTo(100, 2);
    expect(displayWeight(100, "METRIC")).toBe(100);
  });
  it("formats height", () => {
    expect(formatHeight(180, "IMPERIAL")).toBe("5′11″");
    expect(formatHeight(180, "METRIC")).toBe("180 cm");
  });
});

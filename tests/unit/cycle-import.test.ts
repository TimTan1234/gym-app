import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LunaImportError, normalizeDate, normalizeFlow, parseCsvTable, parseLunaFile } from "@/lib/cycle/luna-import";

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");

describe("Luna import helpers", () => {
  it("pads loose dates and rejects impossible ones", () => {
    expect(normalizeDate("2026-8-2")).toBe("2026-08-02");
    expect(normalizeDate("2026-02-30")).toBeNull();
    expect(normalizeDate(null)).toBeNull();
  });

  it("reads every flow spelling Luna has stored", () => {
    expect(normalizeFlow("flow_Medium")).toBe("MEDIUM");
    expect(normalizeFlow("light")).toBe("LIGHT");
    expect(normalizeFlow("Spotting")).toBe("SPOTTING");
    expect(normalizeFlow("")).toBeNull();
  });

  it("parses quoted cells with commas, quotes and line breaks", () => {
    expect(parseCsvTable('"a","b, c"\r\n"say ""hi""","x\ny"\r\n')).toEqual([
      ["a", "b, c"],
      ['say "hi"', "x\ny"],
    ]);
  });
});

describe("Luna JSON backup", () => {
  const result = parseLunaFile("luna-backup-2026-11-03.json", fixture("luna-backup.json"));

  it("keeps valid periods and counts bad dates", () => {
    expect(result.periods).toEqual([
      { startDate: "2026-07-03", endDate: "2026-07-07" },
      { startDate: "2026-07-31", endDate: "2026-08-04" },
      { startDate: "2026-08-28", endDate: null },
    ]);
    expect(result.invalid).toBe(2);
  });

  it("merges duplicate dates and maps symptoms, flow, mood, pain and energy", () => {
    const byDate = new Map(result.days.map((d) => [d.localDate, d]));
    expect([...byDate.keys()]).toEqual(["2026-07-03", "2026-07-29", "2026-07-31", "2026-08-02"]);
    expect(byDate.get("2026-07-03")).toEqual({
      localDate: "2026-07-03",
      flow: "HEAVY",
      symptoms: [{ name: "CRAMPS", severity: "SEVERE" }],
      mood: "LOW",
      pain: 6,
      energy: 2,
      note: "Took ibuprofen",
    });
    expect(byDate.get("2026-07-29")!.symptoms).toEqual([
      { name: "HEADACHE", severity: "MODERATE" },
      { name: "Back pain", severity: "MILD" },
    ]);
    // A period's own symptoms count for its start date.
    expect(byDate.get("2026-07-31")).toMatchObject({ flow: "MEDIUM", symptoms: [{ name: "TENDER_BREASTS", severity: "MILD" }] });
    expect(byDate.get("2026-08-02")).toMatchObject({ flow: "LIGHT", mood: "VERY_LOW" });
    expect(result.customSymptoms).toEqual(["Back pain"]);
  });

  it("rejects JSON that isn't a Luna backup", () => {
    expect(() => parseLunaFile("x.json", '{"format":"other"}')).toThrow(LunaImportError);
    expect(() => parseLunaFile("x.json", "{oops")).toThrow(LunaImportError);
    expect(() => parseLunaFile("x.txt", "")).toThrow(LunaImportError);
  });
});

describe("Luna CSV export", () => {
  const result = parseLunaFile("luna-daily-logs-2026-11-03.csv", fixture("luna-daily-logs.csv"));

  it("rebuilds periods from the start and end columns", () => {
    // The 2026-10-15 end is 20 days after the nearest start, so it belongs to no period.
    expect(result.periods).toEqual([
      { startDate: "2026-09-25", endDate: "2026-09-29" },
      { startDate: "2026-10-23", endDate: null },
    ]);
    expect(result.invalid).toBe(1);
  });

  it("reads symptoms with severity, notes and health metrics", () => {
    const first = result.days[0];
    expect(first).toEqual({
      localDate: "2026-09-25",
      flow: "HEAVY",
      symptoms: [
        { name: "CRAMPS", severity: "SEVERE" },
        { name: "FATIGUE", severity: "MILD" },
      ],
      mood: null,
      pain: 7,
      energy: 1,
      note: 'Rest day, "easy" walk',
    });
    expect(result.days.find((d) => d.localDate === "2026-09-29")).toMatchObject({ flow: "SPOTTING", mood: "GOOD", note: "Line one\nline two" });
    expect(result.days.map((d) => d.localDate)).toEqual(["2026-09-25", "2026-09-26", "2026-09-29", "2026-10-15", "2026-10-23"]);
  });
});

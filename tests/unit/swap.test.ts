import { describe, expect, it } from "vitest";
import { swapOptions } from "@/lib/training/swap";

const ex = (id: string, name: string, primaryMuscle: string, equipment: string, category = "COMPOUND") => ({ id, name, primaryMuscle, equipment, category });
const bench = ex("bench", "Barbell Bench Press", "chest", "barbell");
const library = [
  bench,
  ex("cable-fly", "Cable Fly", "chest", "cable", "ISOLATION"),
  ex("db-press", "Dumbbell Bench Press", "chest", "dumbbell"),
  ex("incline-bench", "Incline Barbell Bench Press", "chest", "barbell"),
  ex("machine-press", "Machine Chest Press", "chest", "machine"),
  ex("push-up", "Push-Up", "chest", "bodyweight"),
  ex("row", "Barbell Row", "back", "barbell"),
  ex("smith-press", "Smith Machine Bench Press", "chest", "smith_machine"),
];

describe("swapOptions", () => {
  it("offers the same muscle with equipment the user has, never the exercise itself", () => {
    const ids = swapOptions(bench, library, ["barbell", "dumbbell", "cable"], new Set(), 10).map((e) => e.id);
    expect(ids).not.toContain("bench");
    expect(ids).not.toContain("row"); // other muscle
    expect(ids).not.toContain("machine-press"); // no machine
    expect(ids).not.toContain("smith-press");
    expect(ids).toContain("push-up"); // bodyweight always counts
  });

  it("puts the same movement first, on other equipment before the same", () => {
    const ids = swapOptions(bench, library, ["barbell", "dumbbell", "cable", "machine"], new Set(), 10).map((e) => e.id);
    expect(ids).toEqual(["db-press", "machine-press", "incline-bench", "push-up", "cable-fly"]);
  });

  it("matches a row with a row, not with a pull-up", () => {
    const row = ex("row", "Barbell Row", "back", "barbell");
    const back = [row, ex("assisted", "Assisted Pull-Up", "back", "machine"), ex("db-row", "Chest-Supported Dumbbell Row", "back", "dumbbell"), ex("cable-row", "Seated Cable Row", "back", "cable")];
    const ids = swapOptions(row, back, ["barbell", "dumbbell", "cable", "machine"], new Set(), 3).map((e) => e.id);
    expect(ids).toEqual(["db-row", "cable-row", "assisted"]);
  });

  it("leaves out exercises already in the workout and stops at the limit", () => {
    const ids = swapOptions(bench, library, ["barbell", "dumbbell", "cable", "machine"], new Set(["db-press"]), 2).map((e) => e.id);
    expect(ids).toEqual(["machine-press", "incline-bench"]);
  });
});

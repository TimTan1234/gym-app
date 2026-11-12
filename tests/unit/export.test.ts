import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv";
import { mealsCsv, workoutsCsv } from "@/lib/export";

const lines = (csv: string) => csv.replace(/^﻿/, "").trimEnd().split("\r\n");

describe("toCsv", () => {
  it("quotes fields with commas, quotes or line breaks, and leaves empty values blank", () => {
    const csv = toCsv(["a", "b", "c", "d"], [['Nasi lemak, "special"', "two\nlines", null, new Date("2026-11-10T01:02:03Z")]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.replace(/^﻿/, "")).toBe('a,b,c,d\r\n"Nasi lemak, ""special""","two\nlines",,2026-11-10T01:02:03.000Z\r\n');
  });
});

describe("export tables", () => {
  const nutrients = { kcal: 500, proteinG: 20, carbsG: 60, fatG: 18, fiberG: 4, sugarG: 6, addedSugarG: 2, sodiumMg: 700 };

  it("writes one row per food, with a drink's Nutri-Grade, and a meal without foods as its totals", () => {
    const meal = { localDate: "2026-11-10", eatenAt: new Date("2026-11-10T00:30:00Z"), mealType: "BREAKFAST", description: "Roti canai", notes: null };
    const food = { saturatedFatG: 8, volumeMl: null, sweetener: false };
    const tehTarik = { ...nutrients, sugarG: 20, saturatedFatG: 3.5, volumeMl: 250, sweetener: false };
    const csv = mealsCsv([
      { ...meal, ...nutrients, items: [{ name: "Roti", quantity: 2, unit: "piece", grams: 160, gi: 70, ...nutrients, ...food }, { name: "Teh tarik", quantity: 1, unit: "mug", grams: 250, gi: 60, ...tehTarik }] },
      { ...meal, ...nutrients, description: "Kopi", items: [] },
    ]);
    const rows = lines(csv);
    expect(rows[0]).toContain("kcal,protein_g,carbs_g,fat_g");
    expect(rows[0]).toMatch(/,gi,saturated_fat_g,volume_ml,sweetener,nutri_grade$/);
    expect(rows).toHaveLength(4);
    expect(rows[1]).toBe("2026-11-10,2026-11-10T00:30:00.000Z,BREAKFAST,Roti canai,,Roti,2,piece,160,500,20,60,18,4,6,2,700,70,8,,false,");
    expect(rows[2]).toBe("2026-11-10,2026-11-10T00:30:00.000Z,BREAKFAST,Roti canai,,Teh tarik,1,mug,250,500,20,60,18,4,20,2,700,60,3.5,250,false,C");
    expect(rows[3]).toBe("2026-11-10,2026-11-10T00:30:00.000Z,BREAKFAST,Kopi,,,,,,500,20,60,18,4,6,2,700,,,,,");
  });

  it("writes one row per set, with cardio's time and distance", () => {
    const csv = workoutsCsv([
      {
        localDate: "2026-11-10",
        startedAt: new Date("2026-11-10T10:00:00Z"),
        endedAt: new Date("2026-11-10T11:00:00Z"),
        name: null,
        notes: null,
        sets: [
          { exercise: "Barbell Back Squat", setIndex: 1, isWarmup: false, weightKg: 100, reps: 5, rpe: 8, durationSec: null, distanceM: null },
          { exercise: "Treadmill Run", setIndex: 1, isWarmup: false, weightKg: 0, reps: 0, rpe: null, durationSec: 1500, distanceM: 5000 },
        ],
      },
    ]);
    const rows = lines(csv);
    expect(rows[0]).toBe("date,started_at,ended_at,workout,notes,exercise,set,warmup,weight_kg,reps,rpe,duration_sec,distance_m");
    expect(rows[1].endsWith("Barbell Back Squat,1,false,100,5,8,,")).toBe(true);
    expect(rows[2].endsWith("Treadmill Run,1,false,0,0,,1500,5000")).toBe(true);
  });
});

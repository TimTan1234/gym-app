import { describe, expect, it } from "vitest";
import { nutriGrade, worstDrink } from "@/lib/nutrition/nutri-grade";

/** A 100 ml drink, so grams are grams per 100 ml. */
const per100 = (sugarG: number, saturatedFatG: number, sweetener = false) => nutriGrade({ sugarG, saturatedFatG, volumeMl: 100, sweetener });

describe("nutriGrade", () => {
  it.each([
    [0, "A"],
    [1, "A"],
    [1.04, "A"], // rounds to 1.0
    [1.05, "B"],
    [5, "B"],
    [5.1, "C"],
    [10, "C"],
    [10.1, "D"],
    [25, "D"],
  ])("grades %s g sugar per 100 ml as %s", (sugar, grade) => {
    expect(per100(sugar, 0)?.grade).toBe(grade);
  });

  it.each([
    [0, "A"],
    [0.7, "A"],
    [0.704, "A"], // rounds to 0.70
    [0.71, "B"],
    [1.2, "B"],
    [1.21, "C"],
    [2.8, "C"],
    [2.81, "D"],
  ])("grades %s g saturated fat per 100 ml as %s", (fat, grade) => {
    expect(per100(0, fat)?.grade).toBe(grade);
  });

  it("takes the worse of the sugar and saturated fat grades, and says which set it", () => {
    expect(per100(0.5, 2)).toMatchObject({ grade: "C", decidedBy: "saturatedFat" });
    expect(per100(12, 0.5)).toMatchObject({ grade: "D", decidedBy: "sugar" });
    expect(per100(4, 1)).toMatchObject({ grade: "B", decidedBy: "both" });
    expect(per100(0, 0)).toMatchObject({ grade: "A", decidedBy: "both" });
  });

  it("never grades a drink with a non-sugar sweetener A", () => {
    expect(per100(0, 0, true)).toMatchObject({ grade: "B", decidedBy: "sweetener" });
    expect(per100(0.5, 1, true)).toMatchObject({ grade: "B", decidedBy: "saturatedFat" });
    expect(per100(3, 0, true)).toMatchObject({ grade: "B", decidedBy: "sugar" });
    expect(per100(0, 2, true)).toMatchObject({ grade: "C", decidedBy: "saturatedFat" });
    expect(per100(7, 0, true)).toMatchObject({ grade: "C", decidedBy: "sugar" });
  });

  it("grades per 100 ml whatever the serving, and gives the values it graded", () => {
    // Teh tarik: 250 ml with 20 g sugar and 3.5 g saturated fat is 8 g and 1.4 g per 100 ml.
    expect(nutriGrade({ sugarG: 20, saturatedFatG: 3.5, volumeMl: 250, sweetener: false })).toEqual({
      grade: "C",
      sugarPer100Ml: 8,
      saturatedFatPer100Ml: 1.4,
      decidedBy: "both",
    });
    // Kopi with evaporated milk and little sugar: the milk's fat sets the grade.
    expect(nutriGrade({ sugarG: 4, saturatedFatG: 4.2, volumeMl: 250, sweetener: false })).toEqual({
      grade: "C",
      sugarPer100Ml: 1.6,
      saturatedFatPer100Ml: 1.68,
      decidedBy: "saturatedFat",
    });
    expect(nutriGrade({ sugarG: 35, saturatedFatG: 0, volumeMl: 330, sweetener: false })).toMatchObject({ grade: "D", sugarPer100Ml: 10.6 });
  });

  it("finds a meal's worst-graded drink, ignoring food and ungraded drinks", () => {
    const kopiO = { name: "Kopi O", sugarG: 0, saturatedFatG: 0, volumeMl: 250, sweetener: false };
    const tehTarik = { name: "Teh tarik", sugarG: 20, saturatedFatG: 3.5, volumeMl: 250, sweetener: false };
    const rice = { name: "Rice", sugarG: 0, saturatedFatG: 0.2, volumeMl: null, sweetener: false };
    const oldDrink = { name: "Milo", sugarG: 30, saturatedFatG: null, volumeMl: 250, sweetener: false };
    expect(worstDrink([kopiO, rice, tehTarik, oldDrink])).toEqual({ item: tehTarik, grade: "C" });
    expect(worstDrink([rice, oldDrink])).toBeNull();
  });

  it("gives no grade to food or to a drink missing a value", () => {
    expect(nutriGrade({ sugarG: 5, saturatedFatG: 1, volumeMl: null, sweetener: false })).toBeNull();
    expect(nutriGrade({ sugarG: 5, saturatedFatG: null, volumeMl: 250, sweetener: false })).toBeNull();
    expect(nutriGrade({ sugarG: 5, saturatedFatG: 1, volumeMl: 0, sweetener: false })).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { BARCODE_RE, productToItem } from "@/lib/nutrition/barcode";

describe("BARCODE_RE", () => {
  it("accepts EAN-8 to GTIN-14 digits only", () => {
    expect(BARCODE_RE.test("3017620422003")).toBe(true);
    expect(BARCODE_RE.test("12345670")).toBe(true);
    expect(BARCODE_RE.test("1234567")).toBe(false);
    expect(BARCODE_RE.test("301762042200a")).toBe(false);
    expect(BARCODE_RE.test("../../etc")).toBe(false);
  });
});

describe("productToItem", () => {
  it("scales per-100 g values to one serving and converts sodium to mg", () => {
    const item = productToItem({
      product_name: "Chocolate Malt Drink",
      brands: "Milo, Nestlé",
      serving_size: "30 g",
      serving_quantity: 30,
      nutriments: { "energy-kcal_100g": 410, proteins_100g: 8, carbohydrates_100g: 70, fat_100g: 9, sugars_100g: 40, sodium_100g: 0.2 },
    })!;
    expect(item.name).toBe("Chocolate Malt Drink (Milo)");
    expect(item.unit).toBe("30 g");
    expect(item.grams).toBe(30);
    expect(item.kcal).toBe(123);
    expect(item.proteinG).toBe(2.4);
    expect(item.sodiumMg).toBe(60);
    expect(item.hasNutrition).toBe(true);
  });

  it("falls back to 100 g, kJ energy and salt", () => {
    const item = productToItem({
      product_name: "Oats",
      serving_quantity: "",
      nutriments: { "energy-kj_100g": 1569, proteins_100g: "13", carbohydrates_100g: 60, fat_100g: 7, salt_100g: 0.025 },
    })!;
    expect(item.grams).toBe(100);
    expect(item.unit).toBe("100 g");
    expect(item.kcal).toBe(375);
    expect(item.proteinG).toBe(13);
    expect(item.sodiumMg).toBe(10);
  });

  it("doesn't repeat a brand already in the name", () => {
    expect(productToItem({ product_name: "Milo Original", brands: "Milo" })!.name).toBe("Milo Original");
  });

  it("flags products without nutrition data", () => {
    const item = productToItem({ product_name: "Mystery snack" })!;
    expect(item.hasNutrition).toBe(false);
    expect(item.kcal).toBe(0);
  });

  it("returns null without a product name", () => {
    expect(productToItem({ nutriments: { "energy-kcal_100g": 100 } })).toBeNull();
  });
});

describe("productToItem added sugar", () => {
  const base = { product_name: "Kaya", serving_quantity: 100, nutriments: { "energy-kcal_100g": 300, proteins_100g: 3, carbohydrates_100g: 50, fat_100g: 10, sugars_100g: 40 } };

  it("uses the label's added sugar when it has one", () => {
    const item = productToItem({ ...base, nutriments: { ...base.nutriments, "added-sugars_100g": 25 } })!;
    expect(item.sugarG).toBe(40);
    expect(item.addedSugarG).toBe(25);
    expect(item.addedSugarFromTotal).toBe(false);
  });

  it("counts all sugar as added when the label doesn't say, and says so", () => {
    const item = productToItem(base)!;
    expect(item.addedSugarG).toBe(40);
    expect(item.addedSugarFromTotal).toBe(true);
  });
});

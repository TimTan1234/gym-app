// Map an Open Food Facts product to a meal draft item. OFF gives nutrients
// per 100 g (or ml); the item is scaled to one serving when one is listed.

import { scaleItem, type Nutrients } from "./totals";

export const BARCODE_RE = /^\d{8,14}$/;

/** Fields requested from Open Food Facts (keeps the response small). */
export const OFF_FIELDS = "code,product_name,brands,serving_size,serving_quantity,nutriments";

export interface OffProduct {
  code?: string;
  product_name?: string;
  brands?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  nutriments?: Record<string, number | string | undefined>;
}

export interface BarcodeItem extends Nutrients {
  name: string;
  quantity: number;
  unit: string;
  grams: number;
  /** False when OFF has the product but no usable nutrition data. */
  hasNutrition: boolean;
}

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function productToItem(p: OffProduct): BarcodeItem | null {
  const name = p.product_name?.trim();
  if (!name) return null;
  const brand = p.brands?.split(",")[0]?.trim();
  const n = p.nutriments ?? {};

  const kj = num(n["energy-kj_100g"]) ?? num(n["energy_100g"]);
  const kcal = num(n["energy-kcal_100g"]) ?? (kj !== null ? kj / 4.184 : null);
  const proteinG = num(n["proteins_100g"]);
  const carbsG = num(n["carbohydrates_100g"]);
  const fatG = num(n["fat_100g"]);
  const sodiumG = num(n["sodium_100g"]) ?? (num(n["salt_100g"]) !== null ? num(n["salt_100g"])! / 2.5 : null);
  const hasNutrition = kcal !== null || (proteinG !== null && carbsG !== null && fatG !== null);

  const per100: Nutrients & { grams: number } = {
    grams: 100,
    kcal: round1(kcal ?? (proteinG ?? 0) * 4 + (carbsG ?? 0) * 4 + (fatG ?? 0) * 9),
    proteinG: round1(proteinG ?? 0),
    carbsG: round1(carbsG ?? 0),
    fatG: round1(fatG ?? 0),
    fiberG: round1(num(n["fiber_100g"]) ?? 0),
    sugarG: round1(num(n["sugars_100g"]) ?? 0),
    sodiumMg: Math.round((sodiumG ?? 0) * 1000),
  };

  const serving = num(p.serving_quantity);
  const useServing = serving !== null && serving > 0 && serving <= 2000;
  const scaled = useServing ? scaleItem(per100, serving) : per100;

  return {
    name: brand && !name.toLowerCase().includes(brand.toLowerCase()) ? `${name} (${brand})` : name,
    quantity: 1,
    unit: useServing ? p.serving_size?.trim() || `${serving} g serving` : "100 g",
    ...scaled,
    hasNutrition,
  };
}

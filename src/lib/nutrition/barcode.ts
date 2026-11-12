// Map an Open Food Facts product to a meal draft item. OFF gives nutrients
// per 100 g (or ml); the item is scaled to one serving when one is listed.

import { scaleItem, type Nutrients } from "./totals";
import type { DrinkFields } from "./nutri-grade";

export const BARCODE_RE = /^\d{8,14}$/;

/** Fields requested from Open Food Facts (keeps the response small). */
export const OFF_FIELDS = "code,product_name,brands,quantity,product_quantity_unit,serving_size,serving_quantity,serving_quantity_unit,additives_tags,nutriments";

export interface OffProduct {
  code?: string;
  product_name?: string;
  brands?: string;
  /** The pack size as printed, e.g. "330 ml". */
  quantity?: string;
  /** "g" or "ml". */
  product_quantity_unit?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  serving_quantity_unit?: string;
  additives_tags?: string[];
  nutriments?: Record<string, number | string | undefined>;
}

export interface BarcodeItem extends Nutrients, DrinkFields {
  name: string;
  quantity: number;
  unit: string;
  grams: number;
  /** False when OFF has the product but no usable nutrition data. */
  hasNutrition: boolean;
  /** True when the label has no added-sugar figure, so all its sugar is counted as added. */
  addedSugarFromTotal: boolean;
}

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** A drink is sold by volume; its per-100 values are then per 100 ml, so its grams are millilitres. */
function isDrink(p: OffProduct): boolean {
  const unit = p.serving_quantity_unit ?? p.product_quantity_unit;
  if (unit) return unit.toLowerCase() === "ml";
  return /\d\s*(ml|cl|l)\b/i.test(p.serving_size ?? p.quantity ?? "");
}

/** Non-sugar sweeteners by E number: sorbitol and mannitol, and E950-E969 (aspartame, sucralose, steviol glycosides, polyols...). */
const SWEETENER_RE = /^en:e(42[01]|9[56]\d)/;

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
  const sugarG = num(n["sugars_100g"]) ?? 0;
  // Few labels list added sugar. Without it, count all of a packaged food's
  // sugar as added: an overestimate for plain milk, right for most snacks and drinks.
  const addedSugar = num(n["added-sugars_100g"]);
  const hasNutrition = kcal !== null || (proteinG !== null && carbsG !== null && fatG !== null);

  const per100: Nutrients & Omit<DrinkFields, "sweetener"> & { grams: number } = {
    grams: 100,
    kcal: round1(kcal ?? (proteinG ?? 0) * 4 + (carbsG ?? 0) * 4 + (fatG ?? 0) * 9),
    proteinG: round1(proteinG ?? 0),
    carbsG: round1(carbsG ?? 0),
    fatG: round1(fatG ?? 0),
    fiberG: round1(num(n["fiber_100g"]) ?? 0),
    sugarG: round1(sugarG),
    addedSugarG: round1(Math.min(addedSugar ?? sugarG, sugarG)),
    sodiumMg: Math.round((sodiumG ?? 0) * 1000),
    saturatedFatG: num(n["saturated-fat_100g"]),
    volumeMl: isDrink(p) ? 100 : null,
  };

  const serving = num(p.serving_quantity);
  const useServing = serving !== null && serving > 0 && serving <= 2000;
  const scaled = useServing ? scaleItem(per100, serving) : per100;
  const unit = per100.volumeMl === null ? "g" : "ml";

  return {
    name: brand && !name.toLowerCase().includes(brand.toLowerCase()) ? `${name} (${brand})` : name,
    quantity: 1,
    unit: useServing ? p.serving_size?.trim() || `${serving} ${unit} serving` : `100 ${unit}`,
    ...scaled,
    sweetener: (p.additives_tags ?? []).some((tag) => SWEETENER_RE.test(tag)),
    hasNutrition,
    addedSugarFromTotal: hasNutrition && addedSugar === null && sugarG > 0,
  };
}

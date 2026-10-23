// Totals for a procurement plan: nutrition per day against the user's targets,
// and cost against the budget. Pure, so the draft editor can use it too.

import { NUTRIENT_KEYS, ZERO_NUTRIENTS, sumNutrients, type Nutrients } from "@/lib/nutrition/totals";
import { MAX_PROTEIN_SHARE, MIN_DAILY_CARBS_G, carbBudget } from "@/lib/nutrition/diabetes";
import type { ActivityLevel, Sex } from "@/lib/nutrition/targets";
import { GROCERY_CATEGORIES, type GroceryCategory } from "@/lib/ai/schemas";

/** Added sugar a day above which the plan is flagged (WHO: under 10% of energy, ideally 25 g). */
export const ADDED_SUGAR_FLAG_G = 25;
/** Within ±10% of a target counts as on target. */
const TOLERANCE = 0.1;

type MaybeNutrients = { [K in keyof Nutrients]?: number | null };

export interface CostItem {
  category: GroceryCategory;
  estPrice: number | null;
  actualPrice?: number | null;
  checked?: boolean;
}

/** Nutrients are filled in together, so kcal tells whether an item has been estimated. */
export const hasNutrients = (item: MaybeNutrients) => item.kcal != null;

const round1 = (n: number) => Math.round(n * 10) / 10;
const cents = (n: number) => Math.round(n * 100) / 100;

export function planNutrition(items: readonly MaybeNutrients[], days: number) {
  const known = items.filter(hasNutrients);
  const total = sumNutrients(known.map((i) => Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, i[k] ?? 0])) as Nutrients));
  const perDay = { ...ZERO_NUTRIENTS };
  for (const key of NUTRIENT_KEYS) perDay[key] = round1(total[key] / Math.max(1, days));
  return { perDay, missing: items.length - known.length };
}

export type TargetStatus = "under" | "ok" | "over";
export type MacroKey = "kcal" | "proteinG" | "carbsG" | "fatG";
export type NutritionFlag = "addedSugarHigh" | "carbsOverBudget" | "carbsUnderMin" | "proteinOverShare";

export interface CheckProfile {
  targetKcal: number;
  targetProteinG: number;
  targetCarbsG: number;
  targetFatG: number;
  diabetesMode: boolean;
  sex: Sex;
  activityLevel: ActivityLevel;
}

/** Just the fields the check needs, e.g. to pass a profile to a client component. */
export const checkProfileOf = (p: CheckProfile): CheckProfile => ({
  targetKcal: p.targetKcal,
  targetProteinG: p.targetProteinG,
  targetCarbsG: p.targetCarbsG,
  targetFatG: p.targetFatG,
  diabetesMode: p.diabetesMode,
  sex: p.sex,
  activityLevel: p.activityLevel,
});

export function targetStatus(value: number, target: number): TargetStatus {
  if (target <= 0) return "ok";
  if (value < target * (1 - TOLERANCE)) return "under";
  if (value > target * (1 + TOLERANCE)) return "over";
  return "ok";
}

export function nutritionCheck(perDay: Nutrients, profile: CheckProfile) {
  const targets: Record<MacroKey, number> = {
    kcal: profile.targetKcal,
    proteinG: profile.targetProteinG,
    carbsG: profile.targetCarbsG,
    fatG: profile.targetFatG,
  };
  const rows = (Object.keys(targets) as MacroKey[]).map((key) => ({
    key,
    value: perDay[key],
    target: targets[key],
    status: targetStatus(perDay[key], targets[key]),
  }));

  const flags: NutritionFlag[] = [];
  if (perDay.addedSugarG > ADDED_SUGAR_FLAG_G) flags.push("addedSugarHigh");
  let carbDailyMax: number | null = null;
  if (profile.diabetesMode) {
    carbDailyMax = carbBudget(profile.sex, profile.activityLevel).dailyMax;
    if (perDay.carbsG > carbDailyMax) flags.push("carbsOverBudget");
    if (perDay.carbsG < MIN_DAILY_CARBS_G) flags.push("carbsUnderMin");
    if (perDay.kcal > 0 && (perDay.proteinG * 4) / perDay.kcal > MAX_PROTEIN_SHARE) flags.push("proteinOverShare");
  }
  return { rows, flags, carbDailyMax };
}

/** What an item costs: what was paid once bought, otherwise the estimate. */
const priceOf = (i: CostItem) => (i.checked ? (i.actualPrice ?? i.estPrice) : i.estPrice) ?? 0;

export function planCost(items: readonly CostItem[], budget: number | null) {
  const estimated = cents(items.reduce((s, i) => s + (i.estPrice ?? 0), 0));
  const spent = cents(items.filter((i) => i.checked).reduce((s, i) => s + priceOf(i), 0));
  const projected = cents(items.reduce((s, i) => s + priceOf(i), 0));
  const byCategory = GROCERY_CATEGORIES.map((category) => ({
    category,
    amount: cents(items.filter((i) => i.category === category).reduce((s, i) => s + priceOf(i), 0)),
  })).filter((c) => c.amount > 0);
  return {
    estimated,
    spent,
    projected,
    remaining: budget == null ? null : cents(budget - projected),
    overBudget: budget != null && projected > budget,
    unpriced: items.filter((i) => i.estPrice == null && i.actualPrice == null).length,
    byCategory,
  };
}

/** Items in shop-aisle order, empty categories left out. */
export function groupByCategory<T extends { category: GroceryCategory; sortOrder?: number }>(items: readonly T[]) {
  return GROCERY_CATEGORIES.map((category) => ({
    category,
    items: items.filter((i) => i.category === category).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
  })).filter((g) => g.items.length > 0);
}

export function formatMoney(amount: number, currency: string, locale: "en" | "zh") {
  try {
    return new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-MY", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** A shareable checklist, e.g. for a chat message. */
export function planToMarkdown(
  plan: {
    title: string;
    currency: string;
    items: (CostItem & { name: string; quantity: number; unit: string; sortOrder?: number })[];
  },
  categoryLabel: (c: GroceryCategory) => string,
  locale: "en" | "zh",
) {
  const lines = [`# ${plan.title}`];
  for (const group of groupByCategory(plan.items)) {
    lines.push("", `## ${categoryLabel(group.category)}`);
    for (const i of group.items) {
      const price = i.estPrice != null ? ` (${formatMoney(i.estPrice, plan.currency, locale)})` : "";
      lines.push(`- [${i.checked ? "x" : " "}] ${i.name}, ${i.quantity} ${i.unit}${price}`);
    }
  }
  return lines.join("\n");
}

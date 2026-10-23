"use server";

import { z } from "zod";
import { refresh } from "next/cache";
import { db } from "@/lib/db";
import { requireProfile } from "@/lib/session";
import { NUTRIENT_KEYS, scaleItem, type Nutrients } from "@/lib/nutrition/totals";
import { GROCERY_CATEGORIES, GroceryItemSaveSchema, ProcurementSaveSchema, type GroceryItemSave, type ProcurementSave } from "@/lib/ai/schemas";
import { isLocalDate } from "@/lib/dates";
import type { ActionResult } from "./profile";
import { getT } from "@/i18n/server";

/** An item's eaten share no longer applies: it is estimated again from the Nutrition tab. */
const CLEARED_ESTIMATE = { consumedGrams: null, gi: null, ...Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, null])) };

async function fail(key: "invalidPlan" | "invalidItem" | "planNotFound" | "itemNotFound"): Promise<{ ok: false; error: string }> {
  return { ok: false, error: (await getT())(`procurement.errors.${key}`) };
}

export async function createProcurementPlan(input: ProcurementSave): Promise<ActionResult & { id?: string }> {
  const { user } = await requireProfile();
  const parsed = ProcurementSaveSchema.safeParse(input);
  if (!parsed.success) return fail("invalidPlan");
  const { items, meals, ...plan } = parsed.data;
  const created = await db.procurementPlan.create({
    data: {
      ...plan,
      userId: user.id,
      items: { create: items.map((item, sortOrder) => ({ ...item, sortOrder })) },
      meals: { create: meals.map((meal, sortOrder) => ({ ...meal, sortOrder })) },
    },
  });
  refresh();
  return { ok: true, id: created.id };
}

// No defaults here: a field left out of a patch must stay as it is.
const PlanPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(80),
    days: z.number().int().min(1).max(31),
    people: z.number().int().min(1).max(12),
    budget: z.number().nonnegative().max(1_000_000).nullable(),
    startDate: z.string().refine(isLocalDate).nullable(),
    status: z.enum(["ACTIVE", "DONE", "ARCHIVED"]),
    notes: z.string().max(400).nullable(),
  })
  .partial();

export async function updateProcurementPlan(id: string, patch: z.input<typeof PlanPatchSchema>): Promise<ActionResult> {
  const { user } = await requireProfile();
  const parsed = PlanPatchSchema.safeParse(patch);
  if (!parsed.success) return fail("invalidPlan");
  const plan = await db.procurementPlan.findFirst({ where: { id, userId: user.id }, select: { days: true, people: true } });
  if (!plan) return fail("planNotFound");
  const { days, people } = parsed.data;
  // Each item's share was estimated for this period and household; it can't
  // just be scaled (rice runs out by the day, a pack of chicken by the share).
  const reshared = (days !== undefined && days !== plan.days) || (people !== undefined && people !== plan.people);
  await db.$transaction([
    db.procurementPlan.update({ where: { id }, data: parsed.data }),
    ...(reshared ? [db.procurementItem.updateMany({ where: { planId: id }, data: CLEARED_ESTIMATE })] : []),
  ]);
  refresh();
  return { ok: true };
}

export async function deleteProcurementPlan(id: string): Promise<ActionResult> {
  const { user } = await requireProfile();
  const { count } = await db.procurementPlan.deleteMany({ where: { id, userId: user.id } });
  if (count === 0) return fail("planNotFound");
  refresh();
  return { ok: true };
}

/** A fresh, unbought copy of a plan, e.g. to buy the same again next week. */
export async function duplicateProcurementPlan(id: string): Promise<ActionResult & { id?: string }> {
  const { user } = await requireProfile();
  const plan = await db.procurementPlan.findFirst({ where: { id, userId: user.id }, include: { items: true, meals: true } });
  if (!plan) return fail("planNotFound");
  const t = await getT();
  const copy = await db.procurementPlan.create({
    data: {
      userId: user.id,
      title: t("procurement.copyTitle", { title: plan.title }).slice(0, 80),
      source: plan.source,
      days: plan.days,
      people: plan.people,
      budget: plan.budget,
      currency: plan.currency,
      notes: plan.notes,
      items: {
        create: plan.items.map(({ id: _id, planId: _planId, checked: _checked, actualPrice: _actualPrice, ...item }) => item),
      },
      meals: { create: plan.meals.map(({ id: _id, planId: _planId, ...meal }) => meal) },
    },
  });
  refresh();
  return { ok: true, id: copy.id };
}

export async function addProcurementItem(planId: string, input: GroceryItemSave): Promise<ActionResult> {
  const { user } = await requireProfile();
  const parsed = GroceryItemSaveSchema.safeParse(input);
  if (!parsed.success) return fail("invalidItem");
  const plan = await db.procurementPlan.findFirst({
    where: { id: planId, userId: user.id },
    select: { _count: { select: { items: true } } },
  });
  if (!plan) return fail("planNotFound");
  if (plan._count.items >= 200) return fail("invalidItem");
  const last = await db.procurementItem.findFirst({ where: { planId }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  await db.procurementItem.create({ data: { ...parsed.data, planId, sortOrder: (last?.sortOrder ?? -1) + 1 } });
  refresh();
  return { ok: true };
}

const ItemPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    quantity: z.number().nonnegative().max(100_000),
    unit: z.string().trim().max(30),
    category: z.enum(GROCERY_CATEGORIES),
    estPrice: z.number().nonnegative().max(1_000_000).nullable(),
    actualPrice: z.number().nonnegative().max(1_000_000).nullable(),
    store: z.string().trim().max(60).nullable(),
    note: z.string().trim().max(200).nullable(),
  })
  .partial();

export async function updateProcurementItem(id: string, patch: z.input<typeof ItemPatchSchema>): Promise<ActionResult> {
  const { user } = await requireProfile();
  const parsed = ItemPatchSchema.safeParse(patch);
  if (!parsed.success) return fail("invalidItem");
  const item = await db.procurementItem.findFirst({ where: { id, plan: { userId: user.id } }, select: { name: true } });
  if (!item) return fail("itemNotFound");
  // Another food needs its own estimate; a quantity change doesn't, as nutrition is the eaten share.
  const renamed = parsed.data.name !== undefined && parsed.data.name !== item.name;
  await db.procurementItem.update({ where: { id }, data: { ...parsed.data, ...(renamed ? { ...CLEARED_ESTIMATE, savedFoodId: null } : {}) } });
  refresh();
  return { ok: true };
}

export async function deleteProcurementItem(id: string): Promise<ActionResult> {
  const { user } = await requireProfile();
  const { count } = await db.procurementItem.deleteMany({ where: { id, plan: { userId: user.id } } });
  if (count === 0) return fail("itemNotFound");
  refresh();
  return { ok: true };
}

const PriceSchema = z.number().nonnegative().max(1_000_000).nullable();

/** Shopping mode: tick an item off, optionally with what it cost. */
export async function setItemChecked(id: string, checked: boolean, actualPrice?: number | null): Promise<ActionResult> {
  const { user } = await requireProfile();
  const price = actualPrice === undefined ? undefined : PriceSchema.safeParse(actualPrice);
  if (price && !price.success) return fail("invalidItem");
  const { count } = await db.procurementItem.updateMany({
    where: { id, plan: { userId: user.id } },
    data: { checked, ...(price ? { actualPrice: price.data } : {}) },
  });
  if (count === 0) return fail("itemNotFound");
  refresh();
  return { ok: true };
}

/**
 * Adds items to Saved Foods as 100 g portions so they're quick to log. A food
 * the user already saved under the same name is linked, never overwritten:
 * they may have set its portion themselves.
 */
export async function saveItemsToFoods(
  planId: string,
  itemIds: string[],
): Promise<(ActionResult & { added?: number; alreadySaved?: number })> {
  const { user } = await requireProfile();
  const items = await db.procurementItem.findMany({
    where: { id: { in: itemIds.slice(0, 200) }, planId, plan: { userId: user.id }, kcal: { not: null }, consumedGrams: { gt: 0 } },
  });
  if (items.length === 0) return { ok: true, added: 0, alreadySaved: 0 };
  const existing = await db.savedFood.findMany({
    where: { userId: user.id, name: { in: items.map((i) => i.name) } },
    select: { id: true, name: true },
  });
  const byName = new Map(existing.map((f) => [f.name, f.id]));

  let added = 0;
  let alreadySaved = 0;
  for (const item of items) {
    let foodId = byName.get(item.name);
    if (foodId) {
      alreadySaved++;
    } else {
      const nutrients = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, item[k] ?? 0])) as Nutrients;
      const per100 = scaleItem({ ...nutrients, grams: item.consumedGrams ?? 0 }, 100);
      const food = await db.savedFood.create({
        data: { userId: user.id, name: item.name, quantity: 100, unit: "g", gi: item.gi, ...per100 },
      });
      foodId = food.id;
      byName.set(item.name, foodId);
      added++;
    }
    await db.procurementItem.update({ where: { id: item.id }, data: { savedFoodId: foodId } });
  }
  refresh();
  return { ok: true, added, alreadySaved };
}

"use server";

import { refresh } from "next/cache";
import { db } from "@/lib/db";
import { requireProfile } from "@/lib/session";
import { addDays, isLocalDate, todayLocal, toLocalDate } from "@/lib/dates";
import { sumNutrients, NUTRIENT_KEYS } from "@/lib/nutrition/totals";
import { MealSaveSchema, type MealSave } from "@/lib/ai/schemas";
import type { ActionResult } from "./profile";
import { getT } from "@/i18n/server";

export async function saveMeal(input: MealSave): Promise<ActionResult & { mealId?: string }> {
  const { user, profile } = await requireProfile();
  const parsed = MealSaveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: (await getT())("nutrition.invalidMeal") };
  const m = parsed.data;

  const eatenAt = new Date(m.eatenAt);
  const localDate = m.localDate && isLocalDate(m.localDate) ? m.localDate : toLocalDate(eatenAt, profile.timezone);
  // Totals are always recomputed from items; never trust client/AI totals.
  const totals = sumNutrients(m.items);

  const meal = await db.meal.create({
    data: {
      userId: user.id,
      eatenAt,
      localDate,
      mealType: m.mealType,
      description: m.description,
      source: m.source,
      notes: m.notes ?? null,
      ...totals,
      items: {
        create: m.items.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          unit: i.unit,
          grams: i.grams,
          kcal: i.kcal,
          proteinG: i.proteinG,
          carbsG: i.carbsG,
          fatG: i.fatG,
          fiberG: i.fiberG,
          sugarG: i.sugarG,
          sodiumMg: i.sodiumMg,
          confidence: i.confidence,
          assumptions: i.assumptions,
        })),
      },
    },
  });
  refresh();
  return { ok: true, mealId: meal.id };
}

export async function deleteMeal(mealId: string): Promise<ActionResult> {
  const { user } = await requireProfile();
  await db.meal.deleteMany({ where: { id: mealId, userId: user.id } });
  refresh();
  return { ok: true };
}

type MealWithItems = NonNullable<Awaited<ReturnType<typeof findMealWithItems>>>;

const findMealWithItems = (userId: string, mealId: string) =>
  db.meal.findFirst({ where: { id: mealId, userId }, include: { items: true } });

/** Copy a meal onto another day. Totals are recomputed from the copied items. */
function cloneMeal(userId: string, meal: MealWithItems, localDate: string, eatenAt: Date) {
  const items = meal.items.map(({ id: _id, mealId: _mealId, ...item }) => item);
  return db.meal.create({
    data: {
      userId,
      eatenAt,
      localDate,
      mealType: meal.mealType,
      description: meal.description,
      source: meal.source,
      notes: meal.notes,
      ...sumNutrients(items),
      items: { create: items },
    },
  });
}

/** Re-log an earlier meal today (e.g. the same breakfast). */
export async function copyMealToToday(mealId: string): Promise<ActionResult> {
  const { user, profile } = await requireProfile();
  const meal = await findMealWithItems(user.id, mealId);
  if (!meal) return { ok: false, error: (await getT())("nutrition.mealNotFound") };
  const now = new Date();
  await cloneMeal(user.id, meal, todayLocal(profile.timezone, now), now);
  refresh();
  return { ok: true };
}

const MealTypeSchema = MealSaveSchema.shape.mealType;

/** Copy every meal of one type from the previous day onto `localDate`. */
export async function copyFromDayBefore(localDate: string, mealType: MealSave["mealType"]): Promise<ActionResult & { count?: number }> {
  const { user, profile } = await requireProfile();
  const today = todayLocal(profile.timezone);
  if (!isLocalDate(localDate) || localDate > today || !MealTypeSchema.safeParse(mealType).success) {
    return { ok: false, error: (await getT())("nutrition.invalidDay") };
  }
  const meals = await db.meal.findMany({
    where: { userId: user.id, localDate: addDays(localDate, -1), mealType },
    include: { items: true },
    orderBy: { eatenAt: "asc" },
  });
  if (meals.length === 0) return { ok: false, error: (await getT())("nutrition.nothingToCopy") };
  // Like saveMeal, past-day logs keep the real log time and an explicit local date.
  const eatenAt = new Date();
  await db.$transaction(meals.map((m) => cloneMeal(user.id, m, localDate, eatenAt)));
  refresh();
  return { ok: true, count: meals.length };
}

/** Star a logged item so it can be re-added in one tap. */
export async function saveFoodFromItem(itemId: string): Promise<ActionResult> {
  const { user } = await requireProfile();
  const item = await db.mealItem.findFirst({ where: { id: itemId, meal: { userId: user.id } } });
  if (!item) return { ok: false, error: (await getT())("nutrition.itemNotFound") };
  const values = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, item[k]])) as Record<(typeof NUTRIENT_KEYS)[number], number>;
  const data = { quantity: item.quantity, unit: item.unit, grams: item.grams, ...values };
  await db.savedFood.upsert({
    where: { userId_name: { userId: user.id, name: item.name } },
    create: { userId: user.id, name: item.name, ...data },
    update: data,
  });
  refresh();
  return { ok: true };
}

export async function deleteSavedFood(id: string): Promise<ActionResult> {
  const { user } = await requireProfile();
  await db.savedFood.deleteMany({ where: { id, userId: user.id } });
  refresh();
  return { ok: true };
}

export async function markSavedFoodsUsed(ids: string[]): Promise<void> {
  const { user } = await requireProfile();
  if (ids.length === 0) return;
  await db.savedFood.updateMany({ where: { id: { in: ids.slice(0, 30) }, userId: user.id }, data: { useCount: { increment: 1 } } });
}

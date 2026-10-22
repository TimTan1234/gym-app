"use server";

import { z } from "zod";
import { refresh } from "next/cache";
import { db } from "@/lib/db";
import { requireProfile } from "@/lib/session";
import { fromLocalDateTime, isLocalDate, todayLocal } from "@/lib/dates";
import {
  GLUCOSE_CONTEXTS,
  MAX_MMOL,
  MIN_MMOL,
  classifyReading,
  toDisplay,
  toMmol,
  unitLabel,
  type GlucoseStatus,
} from "@/lib/glucose";
import type { ActionResult } from "./profile";
import { getT } from "@/i18n/server";

const ReadingSchema = z.object({
  /** In the user's chosen unit. */
  value: z.number().positive(),
  context: z.enum(GLUCOSE_CONTEXTS as [string, ...string[]]),
  localDate: z.string().refine(isLocalDate),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  mealId: z.string().nullable(),
  note: z.string().trim().max(200).nullable(),
});

export type ReadingInput = z.infer<typeof ReadingSchema>;

/** Log a glucose reading. Returns its status so the form can show the low-glucose steps at once. */
export async function logGlucose(input: ReadingInput): Promise<(ActionResult & { status?: GlucoseStatus }) | { ok: true; status: GlucoseStatus }> {
  const { user, profile } = await requireProfile();
  const t = await getT();
  const parsed = ReadingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t("settings.errors.invalid") };
  const r = parsed.data;
  const unit = profile.glucoseUnit;
  const mmol = toMmol(r.value, unit);
  if (mmol < MIN_MMOL || mmol > MAX_MMOL) {
    return { ok: false, error: t("glucose.log.outOfRange", { min: toDisplay(MIN_MMOL, unit), max: toDisplay(MAX_MMOL, unit), unit: unitLabel(unit) }) };
  }
  const today = todayLocal(profile.timezone);
  if (r.localDate > today) return { ok: false, error: t("settings.errors.invalidDate") };

  // Only an after-meal reading belongs to a meal, and only to one of the user's own.
  const context = r.context as (typeof GLUCOSE_CONTEXTS)[number];
  const meal =
    context === "AFTER_MEAL" && r.mealId
      ? await db.meal.findFirst({ where: { id: r.mealId, userId: user.id }, select: { id: true, eatenAt: true } })
      : null;
  if (r.mealId && context === "AFTER_MEAL" && !meal) return { ok: false, error: t("nutrition.mealNotFound") };

  const measuredAt = fromLocalDateTime(r.localDate, r.time, profile.timezone);
  await db.glucoseReading.create({
    data: { userId: user.id, measuredAt, localDate: r.localDate, mmol, context, mealId: meal?.id ?? null, note: r.note || null },
  });
  const minutesAfterMeal = meal ? Math.round((measuredAt.getTime() - meal.eatenAt.getTime()) / 60000) : null;
  const status = classifyReading(
    { mmol, context, minutesAfterMeal },
    { fastingMin: profile.glucoseFastingMin, fastingMax: profile.glucoseFastingMax, postMealMax: profile.glucosePostMealMax },
  );
  refresh();
  return { ok: true, status };
}

export async function deleteGlucose(id: string): Promise<ActionResult> {
  const { user } = await requireProfile();
  await db.glucoseReading.deleteMany({ where: { id, userId: user.id } });
  refresh();
  return { ok: true };
}

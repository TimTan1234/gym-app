"use server";

import { z } from "zod";
import { refresh } from "next/cache";
import { db } from "@/lib/db";
import { requireProfile } from "@/lib/session";
import { daysBetween, formatLocalDate, isLocalDate, todayLocal } from "@/lib/dates";
import { cycleEnabled } from "@/lib/cycle-queries";
import { MAX_END_AFTER_START, learnedPeriodLength, periodOn } from "@/lib/cycle/predict";
import { FLOWS, MAX_CUSTOM_SYMPTOM_CHARS, MOODS, SEVERITIES, isBuiltInSymptom } from "@/lib/cycle/symptoms";
import type { ActionResult } from "./profile";
import { getT } from "@/i18n/server";
import { INTL_LOCALE } from "@/i18n/config";

const DaySchema = z.object({
  localDate: z.string().refine(isLocalDate),
  periodStart: z.boolean(),
  periodEnd: z.boolean(),
  flow: z.enum(FLOWS).nullable(),
  symptoms: z
    .array(z.object({ name: z.string().trim().min(1).max(MAX_CUSTOM_SYMPTOM_CHARS), severity: z.enum(SEVERITIES) }))
    .max(40)
    .refine((list) => new Set(list.map((s) => s.name)).size === list.length),
  mood: z.enum(MOODS).nullable(),
  pain: z.number().int().min(0).max(10).nullable(),
  energy: z.number().int().min(1).max(5).nullable(),
  note: z.string().trim().max(1000).nullable(),
});

export type CycleDayInput = z.infer<typeof DaySchema>;

/**
 * Save one day: its log, and whether a period starts or ends on it. A start can't
 * fall inside another period; an end belongs to the latest period that started
 * up to 14 days before. A day with nothing logged is removed.
 */
export async function saveCycleDay(input: CycleDayInput): Promise<ActionResult> {
  const { user, profile } = await requireProfile();
  const t = await getT();
  const parsed = DaySchema.safeParse(input);
  if (!parsed.success || !cycleEnabled(profile)) return { ok: false, error: t("settings.errors.invalid") };
  const d = parsed.data;
  const date = d.localDate;
  if (date > todayLocal(profile.timezone)) return { ok: false, error: t("cycle.errors.future") };

  const periods = await db.period.findMany({ where: { userId: user.id }, orderBy: { startDate: "asc" } });
  const periodLength = learnedPeriodLength(periods, profile.periodLength);
  const startsHere = periods.find((p) => p.startDate === date);
  const ops = [];

  if (d.periodStart) {
    const inside = periodOn(date, periods.filter((p) => p !== startsHere), periodLength);
    if (inside) return { ok: false, error: t("cycle.errors.insidePeriod", { date: formatLocalDate(inside.startDate, undefined, INTL_LOCALE[t.locale]) }) };
    const endDate = d.periodEnd ? date : startsHere?.endDate === date ? null : (startsHere?.endDate ?? null);
    ops.push(
      db.period.upsert({
        where: { userId_startDate: { userId: user.id, startDate: date } },
        create: { userId: user.id, startDate: date, endDate },
        update: { endDate },
      }),
    );
  } else {
    if (startsHere) ops.push(db.period.delete({ where: { id: startsHere.id } }));
    const others = periods.filter((p) => p !== startsHere);
    if (d.periodEnd) {
      const owner = others.filter((p) => p.startDate < date && daysBetween(p.startDate, date) <= MAX_END_AFTER_START).at(-1);
      if (!owner) return { ok: false, error: t("cycle.errors.endWithoutStart") };
      if (owner.endDate !== date) ops.push(db.period.update({ where: { id: owner.id }, data: { endDate: date } }));
    } else {
      for (const p of others.filter((p) => p.endDate === date)) ops.push(db.period.update({ where: { id: p.id }, data: { endDate: null } }));
    }
  }

  const note = d.note || null;
  const empty = !d.flow && d.symptoms.length === 0 && !d.mood && d.pain === null && d.energy === null && !note;
  const log = { flow: d.flow, symptoms: d.symptoms, mood: d.mood, pain: d.pain, energy: d.energy, note };
  ops.push(
    empty
      ? db.cycleDay.deleteMany({ where: { userId: user.id, localDate: date } })
      : db.cycleDay.upsert({
          where: { userId_localDate: { userId: user.id, localDate: date } },
          create: { userId: user.id, localDate: date, ...log },
          update: log,
        }),
  );

  // Custom symptoms join the user's list the first time they're saved.
  const newCustom = d.symptoms.map((s) => s.name).filter((n) => !isBuiltInSymptom(n) && !profile.customSymptoms.includes(n));
  if (newCustom.length) ops.push(db.profile.update({ where: { userId: user.id }, data: { customSymptoms: [...profile.customSymptoms, ...newCustom] } }));

  await db.$transaction(ops);
  refresh();
  return { ok: true };
}

/** Clear everything on one day: its log, a period starting on it, and a period end on it. */
export async function deleteCycleDay(localDate: string): Promise<ActionResult> {
  const { user } = await requireProfile();
  if (!isLocalDate(localDate)) return { ok: false, error: (await getT())("settings.errors.invalidDate") };
  await db.$transaction([
    db.cycleDay.deleteMany({ where: { userId: user.id, localDate } }),
    db.period.deleteMany({ where: { userId: user.id, startDate: localDate } }),
    db.period.updateMany({ where: { userId: user.id, endDate: localDate }, data: { endDate: null } }),
  ]);
  refresh();
  return { ok: true };
}

export async function deletePeriod(id: string): Promise<ActionResult> {
  const { user } = await requireProfile();
  await db.period.deleteMany({ where: { id, userId: user.id } });
  refresh();
  return { ok: true };
}

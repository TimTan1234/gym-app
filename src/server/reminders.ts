"use server";

import { z } from "zod";
import { refresh } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { isTime } from "@/lib/reminders";
import { LOCALES } from "@/i18n/config";
import { getT } from "@/i18n/server";
import type { ActionResult } from "./profile";

const SubscriptionSchema = z.object({
  // Push services are always HTTPS.
  endpoint: z.url({ protocol: /^https$/ }).max(2000),
  p256dh: z.string().min(1).max(200),
  auth: z.string().min(1).max(100),
  locale: z.enum(LOCALES),
});

/** Remembers this device's push subscription for the signed-in user. */
export async function savePushSubscription(input: z.infer<typeof SubscriptionSchema>): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = SubscriptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: (await getT())("common.somethingWrong") };
  const { endpoint, ...rest } = parsed.data;
  // A device that someone else used before belongs to whoever subscribes it now.
  await db.pushSubscription.upsert({ where: { endpoint }, create: { endpoint, userId: user.id, ...rest }, update: { userId: user.id, ...rest } });
  return { ok: true };
}

/** Stops reminders to this device. */
export async function removePushSubscription(endpoint: string): Promise<ActionResult> {
  const user = await requireUser();
  await db.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
  return { ok: true };
}

const SettingsSchema = z.object({
  weighInReminder: z.boolean(),
  weighInTime: z.string().refine(isTime),
  workoutReminder: z.boolean(),
  workoutTime: z.string().refine(isTime),
  workoutDays: z.array(z.number().int().min(1).max(7)).max(7),
});

export async function saveReminderSettings(input: z.infer<typeof SettingsSchema>): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = SettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: (await getT())("common.somethingWrong") };
  const d = parsed.data;
  await db.profile.update({ where: { userId: user.id }, data: { ...d, workoutDays: [...new Set(d.workoutDays)].sort() } });
  refresh();
  return { ok: true };
}

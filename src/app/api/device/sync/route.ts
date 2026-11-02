import { z } from "zod";
import { db } from "@/lib/db";
import { deviceFromRequest } from "@/lib/devices";
import { addDays, isLocalDate, todayLocal } from "@/lib/dates";

const Day = z.object({
  date: z.string().refine(isLocalDate),
  steps: z.number().int().min(0).max(200_000).nullable().optional(),
  sleepMinutes: z.number().int().min(0).max(24 * 60).nullable().optional(),
  sleepStart: z.iso.datetime({ offset: true }).nullable().optional(),
  sleepEnd: z.iso.datetime({ offset: true }).nullable().optional(),
});
const SyncSchema = z.object({ days: z.array(Day).min(1).max(31) });

/**
 * Daily steps and sleep from the linked phone. Each day is replaced by the phone's latest totals
 * (a day keeps changing until it's over). Days too far in the future for any time zone are dropped.
 */
export async function POST(request: Request) {
  const device = await deviceFromRequest(request);
  if (!device) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = SyncSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  const latest = addDays(todayLocal(device.user.profile?.timezone ?? "UTC"), 1);
  const days = body.data.days.filter((d) => d.date <= latest);
  await db.$transaction([
    ...days.map((d) => {
      const data = {
        steps: d.steps ?? null,
        sleepMinutes: d.sleepMinutes ?? null,
        sleepStart: d.sleepStart ? new Date(d.sleepStart) : null,
        sleepEnd: d.sleepEnd ? new Date(d.sleepEnd) : null,
      };
      return db.dailyActivity.upsert({
        where: { userId_localDate: { userId: device.userId, localDate: d.date } },
        create: { userId: device.userId, localDate: d.date, ...data },
        update: data,
      });
    }),
    db.linkedDevice.update({ where: { id: device.id }, data: { lastSyncAt: new Date() } }),
  ]);
  return Response.json({ ok: true, saved: days.length });
}

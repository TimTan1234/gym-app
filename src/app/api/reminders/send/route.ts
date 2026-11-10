import { db } from "@/lib/db";
import { sendPush, vapidPublicKey, type PushMessage } from "@/lib/push";
import { dueReminders, localNow, type ReminderKind } from "@/lib/reminders";
import { isLocale } from "@/i18n/config";
import { createT } from "@/i18n/translate";

const URLS: Record<ReminderKind, string> = { WEIGH_IN: "/today", WORKOUT: "/train" };

/**
 * Sends the push reminders that are due, each at most once per user per local day. Called every
 * few minutes by a scheduler (the `reminders` service in docker-compose.yml) with CRON_SECRET.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !vapidPublicKey()) return Response.json({ error: "Reminders are not configured" }, { status: 404 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const profiles = await db.profile.findMany({
    where: { OR: [{ weighInReminder: true }, { workoutReminder: true }], user: { pushSubscriptions: { some: {} } } },
    select: { userId: true, timezone: true, weighInReminder: true, weighInTime: true, workoutReminder: true, workoutTime: true, workoutDays: true },
  });

  let sent = 0;
  let gone = 0;
  for (const p of profiles) {
    const { localDate, localTime } = localNow(now, p.timezone);
    const [weighIn, workout, plan, already] = await Promise.all([
      db.bodyMetric.findFirst({ where: { userId: p.userId, localDate }, select: { id: true } }),
      db.workoutSession.findFirst({ where: { userId: p.userId, localDate }, select: { id: true } }),
      db.trainingPlan.findFirst({ where: { userId: p.userId, isActive: true }, select: { id: true } }),
      db.reminderSent.findMany({ where: { userId: p.userId, localDate }, select: { kind: true } }),
    ]);
    const due = dueReminders(p, {
      localDate,
      localTime,
      weighedIn: !!weighIn,
      workoutStarted: !!workout,
      hasActivePlan: !!plan,
      sent: already.map((r) => r.kind),
    });
    for (const kind of due) {
      // Claimed before sending: a second run overlapping this one finds the row and skips it.
      const claimed = await db.reminderSent.createMany({ data: [{ userId: p.userId, kind, localDate }], skipDuplicates: true });
      if (claimed.count === 0) continue;
      const subs = await db.pushSubscription.findMany({ where: { userId: p.userId } });
      for (const sub of subs) {
        const t = createT(isLocale(sub.locale) ? sub.locale : "en");
        const message: PushMessage = { title: t(`settings.reminders.push.${kind}.title`), body: t(`settings.reminders.push.${kind}.body`), url: URLS[kind], tag: kind };
        try {
          if ((await sendPush(sub, message)) === "gone") {
            await db.pushSubscription.delete({ where: { id: sub.id } });
            gone++;
          } else {
            sent++;
          }
        } catch (e) {
          // One unreachable push service shouldn't stop everyone else's reminders.
          console.error("Push failed", sub.endpoint.slice(0, 60), e);
        }
      }
    }
  }
  return Response.json({ sent, gone });
}

import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/session";
import { db } from "@/lib/db";
import { vapidPublicKey } from "@/lib/push";
import { ReminderSettings } from "@/components/profile/ReminderSettings";
import { SettingsSubpage } from "@/components/profile/SettingsSubpage";
import { Card, PageSkeleton } from "@/components/ui";
import { getT } from "@/i18n/server";

export const metadata = { title: "Reminders" };

async function Reminders() {
  const { user, profile } = await requireProfile();
  const publicKey = vapidPublicKey();
  if (!publicKey) notFound();
  const [t, plan] = await Promise.all([getT(), db.trainingPlan.findFirst({ where: { userId: user.id, isActive: true }, select: { id: true } })]);
  return (
    <SettingsSubpage title={t("settings.reminders.title")}>
      <Card>
        <ReminderSettings
          publicKey={publicKey}
          hasActivePlan={!!plan}
          initial={{
            weighInReminder: profile.weighInReminder,
            weighInTime: profile.weighInTime,
            workoutReminder: profile.workoutReminder,
            workoutTime: profile.workoutTime,
            workoutDays: profile.workoutDays,
          }}
        />
      </Card>
    </SettingsSubpage>
  );
}

export default function RemindersPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Reminders />
    </Suspense>
  );
}

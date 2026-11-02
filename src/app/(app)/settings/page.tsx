import { Suspense } from "react";
import { requireProfile } from "@/lib/session";
import { getLatestWeight } from "@/lib/queries";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { TargetsEditor } from "@/components/profile/TargetsEditor";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { InstallApp } from "@/components/InstallApp";
import { Card, CardTitle, PageHeader, PageSkeleton } from "@/components/ui";
import { DisplaySettings } from "@/components/profile/DisplaySettings";
import { DiabetesSettings } from "@/components/profile/DiabetesSettings";
import { carbBudget } from "@/lib/nutrition/diabetes";
import { LinkedPhones } from "@/components/profile/LinkedPhones";
import { LINK_CODE_MINUTES } from "@/lib/devices";
import { existsSync } from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";
import { INTL_LOCALE } from "@/i18n/config";
import { getT } from "@/i18n/server";

export const metadata = { title: "Settings" };

async function Settings() {
  const { user, profile } = await requireProfile();
  const [latest, t, phones] = await Promise.all([
    getLatestWeight(user.id),
    getT(),
    db.linkedDevice.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, lastSyncAt: true } }),
  ]);
  // The address the phone must reach: the one this deployment is configured with.
  const serverUrl = (process.env.BETTER_AUTH_URL ?? "").replace(/\/$/, "");
  // Offered once scripts/build-android.sh has put the app in public/downloads.
  const apk = existsSync(path.join(process.cwd(), "public/downloads/gympal-health.apk")) ? "/downloads/gympal-health.apk" : null;
  const when = (d: Date) => d.toLocaleString(INTL_LOCALE[t.locale], { timeZone: profile.timezone, dateStyle: "medium", timeStyle: "short" });
  return (
    // Most used first: the targets people come to check or change, then the profile they're worked out from.
    <div className="space-y-6">
      <PageHeader title={t("settings.title")} />
      <InstallApp />
      <Card className="space-y-3">
        <CardTitle>{t("settings.dailyTargets")}</CardTitle>
        {/* Keyed on the values: saving diabetes settings can recompute them. */}
        <TargetsEditor
          key={`${profile.targetKcal}:${profile.targetProteinG}:${profile.targetCarbsG}:${profile.targetFatG}:${profile.targetsManual}`}
          initial={profile}
        />
      </Card>
      <Card className="space-y-3">
        <CardTitle>{t("settings.profile")}</CardTitle>
        <ProfileForm
          submitLabel={t("settings.saveProfile")}
          initial={{
            name: user.name,
            sex: profile.sex,
            birthDate: profile.birthDate.toISOString().slice(0, 10),
            heightCm: profile.heightCm,
            weightKg: latest?.weightKg,
            activityLevel: profile.activityLevel,
            goal: profile.goal,
            rateKgPerWeek: profile.rateKgPerWeek,
            timezone: profile.timezone,
            unitSystem: profile.unitSystem,
            experience: profile.experience,
            equipment: profile.equipment,
          }}
        />
      </Card>
      <Card className="space-y-3 scroll-mt-4" id="diabetes">
        <CardTitle>{t("glucose.settings.title")}</CardTitle>
        <DiabetesSettings initial={profile} budget={carbBudget(profile.sex, profile.activityLevel)} />
      </Card>
      <Card className="space-y-3" id="phone">
        <CardTitle>{t("settings.phone.title")}</CardTitle>
        <LinkedPhones phones={phones.map((p) => ({ id: p.id, name: p.name, lastSync: p.lastSyncAt ? when(p.lastSyncAt) : null }))} serverUrl={serverUrl} minutes={LINK_CODE_MINUTES} apk={apk} />
      </Card>
      <Card className="space-y-4">
        <CardTitle>{t("settings.display")}</CardTitle>
        <DisplaySettings />
      </Card>
      <section className="flex items-center justify-between gap-3 border-y border-line py-3">
        <div className="min-w-0">
          <p className="font-medium">{user.name}</p>
          <p className="truncate text-[13px] text-steel">{user.email}</p>
        </div>
        <SignOutButton />
      </section>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Settings />
    </Suspense>
  );
}

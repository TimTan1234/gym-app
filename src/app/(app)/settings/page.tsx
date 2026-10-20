import { Suspense } from "react";
import { requireProfile } from "@/lib/session";
import { getLatestWeight } from "@/lib/queries";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { TargetsEditor } from "@/components/profile/TargetsEditor";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { InstallApp } from "@/components/InstallApp";
import { Card, CardTitle, PageHeader, PageSkeleton } from "@/components/ui";
import { DisplaySettings } from "@/components/profile/DisplaySettings";
import { getT } from "@/i18n/server";

export const metadata = { title: "Settings" };

async function Settings() {
  const { user, profile } = await requireProfile();
  const [latest, t] = await Promise.all([getLatestWeight(user.id), getT()]);
  return (
    <div className="space-y-6">
      <PageHeader title={t("settings.title")} subtitle={user.email} action={<SignOutButton />} />
      <InstallApp />
      <Card className="space-y-4">
        <CardTitle>{t("settings.display")}</CardTitle>
        <DisplaySettings />
      </Card>
      <Card className="space-y-3">
        <CardTitle>{t("settings.dailyTargets")}</CardTitle>
        <TargetsEditor initial={profile} />
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

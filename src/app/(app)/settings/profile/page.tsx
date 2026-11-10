import { Suspense } from "react";
import { requireProfile } from "@/lib/session";
import { getLatestWeight } from "@/lib/queries";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { SettingsSubpage } from "@/components/profile/SettingsSubpage";
import { Card, PageSkeleton } from "@/components/ui";
import { getT } from "@/i18n/server";

export const metadata = { title: "Profile" };

async function Profile() {
  const { user, profile } = await requireProfile();
  const [latest, t] = await Promise.all([getLatestWeight(user.id), getT()]);
  return (
    <SettingsSubpage title={t("settings.profile")}>
      <Card>
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
    </SettingsSubpage>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Profile />
    </Suspense>
  );
}

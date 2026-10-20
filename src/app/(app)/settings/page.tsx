import { Suspense } from "react";
import { requireProfile } from "@/lib/session";
import { getLatestWeight } from "@/lib/queries";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { TargetsEditor } from "@/components/profile/TargetsEditor";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { InstallApp } from "@/components/InstallApp";
import { Card, CardTitle, PageHeader, PageSkeleton } from "@/components/ui";

export const metadata = { title: "Settings" };

async function Settings() {
  const { user, profile } = await requireProfile();
  const latest = await getLatestWeight(user.id);
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle={user.email} action={<SignOutButton />} />
      <InstallApp />
      <Card className="space-y-3">
        <CardTitle>Daily targets</CardTitle>
        <TargetsEditor initial={profile} />
      </Card>
      <Card className="space-y-3">
        <CardTitle>Profile</CardTitle>
        <ProfileForm
          submitLabel="Save profile"
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

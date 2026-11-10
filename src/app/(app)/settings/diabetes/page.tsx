import { Suspense } from "react";
import { requireProfile } from "@/lib/session";
import { carbBudget } from "@/lib/nutrition/diabetes";
import { DiabetesSettings } from "@/components/profile/DiabetesSettings";
import { SettingsSubpage } from "@/components/profile/SettingsSubpage";
import { Card, PageSkeleton } from "@/components/ui";
import { getT } from "@/i18n/server";

export const metadata = { title: "Diabetes mode" };

async function Diabetes() {
  const [{ profile }, t] = await Promise.all([requireProfile(), getT()]);
  return (
    <SettingsSubpage title={t("glucose.settings.title")}>
      <Card id="diabetes">
        <DiabetesSettings initial={profile} budget={carbBudget(profile.sex, profile.activityLevel)} />
      </Card>
    </SettingsSubpage>
  );
}

export default function DiabetesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Diabetes />
    </Suspense>
  );
}

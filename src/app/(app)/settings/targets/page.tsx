import { Suspense } from "react";
import { requireProfile } from "@/lib/session";
import { TargetsEditor } from "@/components/profile/TargetsEditor";
import { SettingsSubpage } from "@/components/profile/SettingsSubpage";
import { Card, PageSkeleton } from "@/components/ui";
import { getT } from "@/i18n/server";

export const metadata = { title: "Daily targets" };

async function Targets() {
  const [{ profile }, t] = await Promise.all([requireProfile(), getT()]);
  return (
    <SettingsSubpage title={t("settings.dailyTargets")}>
      <Card>
        {/* Keyed on the values: saving diabetes settings can recompute them. */}
        <TargetsEditor
          key={`${profile.targetKcal}:${profile.targetProteinG}:${profile.targetCarbsG}:${profile.targetFatG}:${profile.targetsManual}`}
          initial={profile}
        />
      </Card>
    </SettingsSubpage>
  );
}

export default function TargetsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Targets />
    </Suspense>
  );
}

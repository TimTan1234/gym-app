import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/session";
import { CycleSettings } from "@/components/profile/CycleSettings";
import { SettingsSubpage } from "@/components/profile/SettingsSubpage";
import { Card, PageSkeleton } from "@/components/ui";
import { getT } from "@/i18n/server";

export const metadata = { title: "Cycle" };

async function Cycle() {
  const [{ profile }, t] = await Promise.all([requireProfile(), getT()]);
  // Offered to women only, as on the Settings list.
  if (profile.sex !== "FEMALE") notFound();
  return (
    <SettingsSubpage title={t("cycle.settings.title")}>
      <Card id="cycle">
        <CycleSettings initial={profile} />
      </Card>
    </SettingsSubpage>
  );
}

export default function CyclePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Cycle />
    </Suspense>
  );
}

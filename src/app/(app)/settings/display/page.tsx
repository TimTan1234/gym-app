import { Suspense } from "react";
import { requireProfile } from "@/lib/session";
import { DisplaySettings } from "@/components/profile/DisplaySettings";
import { SettingsSubpage } from "@/components/profile/SettingsSubpage";
import { Card, PageSkeleton } from "@/components/ui";
import { getT } from "@/i18n/server";

export const metadata = { title: "Display" };

async function Display() {
  const [, t] = await Promise.all([requireProfile(), getT()]);
  return (
    <SettingsSubpage title={t("settings.display")}>
      <Card>
        <DisplaySettings />
      </Card>
    </SettingsSubpage>
  );
}

export default function DisplayPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Display />
    </Suspense>
  );
}

import type { ReactNode } from "react";
import { BackLink, PageHeader } from "@/components/ui";
import { getT } from "@/i18n/server";

/** One of the pages opened from the Settings list: the way back, its title, its content. */
export async function SettingsSubpage({ title, children }: { title: string; children: ReactNode }) {
  const t = await getT();
  return (
    <>
      <BackLink href="/settings" label={t("settings.title")} />
      <PageHeader title={title} />
      <div className="space-y-6">{children}</div>
    </>
  );
}

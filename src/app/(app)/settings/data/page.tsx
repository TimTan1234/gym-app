import { Suspense } from "react";
import { Download } from "lucide-react";
import { requireProfile } from "@/lib/session";
import { DATASETS } from "@/lib/export";
import { SettingsSubpage } from "@/components/profile/SettingsSubpage";
import { PageSkeleton, buttonClass, cn } from "@/components/ui";
import { getT } from "@/i18n/server";

export const metadata = { title: "Your data" };

async function YourData() {
  const [, t] = await Promise.all([requireProfile(), getT()]);
  return (
    <SettingsSubpage title={t("settings.export.title")}>
      <div className="grid gap-2 sm:grid-cols-2">
        {DATASETS.map((d) => (
          <a key={d} href={`/api/export/${d}`} download className={cn(buttonClass("secondary"), "justify-start")}>
            <Download className="size-4" aria-hidden /> {t(`settings.export.${d}`)}
          </a>
        ))}
      </div>
    </SettingsSubpage>
  );
}

export default function DataPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <YourData />
    </Suspense>
  );
}

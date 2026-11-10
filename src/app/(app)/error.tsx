"use client";

import { Button } from "@/components/ui";
import { useT } from "@/i18n/client";

/** A page that failed to load, inside the app's navigation, with a way to try it again. */
export default function AppError({ retry }: { error: unknown; retry: () => void }) {
  const t = useT();
  return (
    <div className="space-y-4">
      <h1 className="display text-[34px]">{t("common.errorTitle")}</h1>
      <Button onClick={() => retry()}>{t("common.retry")}</Button>
    </div>
  );
}

"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { applyCheckin } from "@/server/profile";
import { Button } from "@/components/ui";
import { useT } from "@/i18n/client";

export function ApplyCheckinButton({ kcal }: { kcal: number }) {
  const [pending, startTransition] = useTransition();
  const t = useT();
  const value = kcal.toLocaleString("en-US");
  return (
    <Button
      variant="inverse"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await applyCheckin();
          if (res.ok) toast.success(t("progress.checkin.targetSet", { kcal: value }));
          else toast.error(res.error);
        })
      }
    >
      {pending ? t("common.saving") : t("progress.checkin.use", { kcal: value })}
    </Button>
  );
}

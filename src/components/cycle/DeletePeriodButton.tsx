"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deletePeriod } from "@/server/cycle";
import { Button } from "@/components/ui";
import { useConfirmTap } from "./useConfirmTap";
import { useT } from "@/i18n/client";

export function DeletePeriodButton({ id, label }: { id: string; label: string }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const { armed, tap } = useConfirmTap(() =>
    startTransition(async () => {
      const res = await deletePeriod(id);
      if (res.ok) toast.success(t("cycle.periods.deleted"));
      else toast.error(res.error);
    }),
  );
  return (
    <Button variant="danger" size="sm" aria-label={armed ? undefined : `${t("cycle.periods.delete")}: ${label}`} disabled={pending} onClick={tap}>
      <Trash2 className="size-4" aria-hidden /> {armed ? t("cycle.confirmDelete") : t("cycle.periods.delete")}
    </Button>
  );
}

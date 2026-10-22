"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteGlucose } from "@/server/glucose";
import { IconButton } from "@/components/ui";
import { useT } from "@/i18n/client";

export function DeleteReadingButton({ id, time }: { id: string; time: string }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  return (
    <IconButton
      tone="danger"
      edge="end"
      aria-label={t("glucose.log.delete", { time })}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await deleteGlucose(id);
          if (res.ok) toast.success(t("glucose.log.deleted"));
          else toast.error(res.error);
        })
      }
    >
      <Trash2 className="size-4" />
    </IconButton>
  );
}

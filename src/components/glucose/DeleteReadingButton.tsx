"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteGlucose } from "@/server/glucose";
import { useT } from "@/i18n/client";

export function DeleteReadingButton({ id, time }: { id: string; time: string }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      aria-label={t("glucose.log.delete", { time })}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await deleteGlucose(id);
          if (res.ok) toast.success(t("glucose.log.deleted"));
          else toast.error(res.error);
        })
      }
      className="grid size-8 shrink-0 place-items-center rounded-[8px] text-steel hover:bg-alert/10 hover:text-alert disabled:opacity-50"
    >
      <Trash2 className="size-4" />
    </button>
  );
}

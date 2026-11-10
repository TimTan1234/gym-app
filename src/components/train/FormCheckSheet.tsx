"use client";

import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { FormLift } from "@/lib/training/form-check";
import { useT } from "@/i18n/client";
import { FormCheckLazy } from "./FormCheckLazy";

/** The form check over the whole screen for one exercise of a workout; closing it stops the camera. */
export function FormCheckSheet({ lift, title, onUseReps, onClose }: { lift: FormLift; title: string; onUseReps: (reps: number) => void; onClose: () => void }) {
  const t = useT();
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${t("train.formCheck.title")}: ${title}`}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
      className="fixed inset-0 z-50 overflow-y-auto bg-chalk"
    >
      <div className="mx-auto max-w-3xl px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="display min-w-0 truncate text-[22px]">{title}</h2>
          <button type="button" aria-label={t("common.close")} onClick={onClose} className="rounded-field p-2 text-steel hover:bg-wash hover:text-iron">
            <X className="size-5" />
          </button>
        </div>
        <FormCheckLazy lift={lift} onUseReps={onUseReps} />
      </div>
    </div>,
    document.body,
  );
}

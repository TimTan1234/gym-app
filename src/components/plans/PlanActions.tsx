"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { deactivatePlan, deletePlan, setActivePlan } from "@/server/plans";
import { Button } from "@/components/ui";
import { useT } from "@/i18n/client";

export function PlanActions({ planId, isActive }: { planId: string; isActive: boolean }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) =>
    startTransition(async () => {
      const res = await fn();
      if (res.ok) toast.success(msg);
      else toast.error(res.error ?? t("common.somethingWrong"));
    });
  return (
    <div className="flex gap-2">
      {isActive ? (
        <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => deactivatePlan(planId), t("plans.actions.deactivated"))}>
          {t("plans.actions.deactivate")}
        </Button>
      ) : (
        <Button size="sm" disabled={pending} onClick={() => run(() => setActivePlan(planId), t("plans.actions.activated"))}>
          {t("plans.actions.activate")}
        </Button>
      )}
      <Button
        variant="danger"
        size="sm"
        disabled={pending}
        onClick={() => {
          if (confirm(t("plans.actions.deleteConfirm"))) run(() => deletePlan(planId), t("plans.actions.deleted"));
        }}
      >
        {t("common.delete")}
      </Button>
    </div>
  );
}

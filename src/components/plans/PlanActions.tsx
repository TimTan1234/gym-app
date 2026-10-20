"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { deactivatePlan, deletePlan, setActivePlan } from "@/server/plans";
import { Button } from "@/components/ui";

export function PlanActions({ planId, isActive }: { planId: string; isActive: boolean }) {
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) =>
    startTransition(async () => {
      const res = await fn();
      if (res.ok) toast.success(msg);
      else toast.error(res.error ?? "Failed");
    });
  return (
    <div className="flex gap-2">
      {isActive ? (
        <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => deactivatePlan(planId), "Plan deactivated")}>
          Deactivate
        </Button>
      ) : (
        <Button size="sm" disabled={pending} onClick={() => run(() => setActivePlan(planId), "Plan activated")}>
          Activate
        </Button>
      )}
      <Button
        variant="danger"
        size="sm"
        disabled={pending}
        onClick={() => {
          if (confirm("Delete this plan? Your workout history is kept.")) run(() => deletePlan(planId), "Plan deleted");
        }}
      >
        Delete
      </Button>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setTargets } from "@/server/profile";
import { Button, Input, Label, cn } from "@/components/ui";

interface Targets {
  targetKcal: number;
  targetProteinG: number;
  targetCarbsG: number;
  targetFatG: number;
  targetsManual: boolean;
}

export function TargetsEditor({ initial }: { initial: Targets }) {
  const [manual, setManual] = useState(initial.targetsManual);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const n = (k: string) => Math.round(Number(f.get(k)) || 0);
    startTransition(async () => {
      const res = await setTargets({
        manual,
        targetKcal: manual ? n("kcal") : initial.targetKcal,
        targetProteinG: manual ? n("protein") : initial.targetProteinG,
        targetCarbsG: manual ? n("carbs") : initial.targetCarbsG,
        targetFatG: manual ? n("fat") : initial.targetFatG,
      });
      if (res.ok) toast.success("Targets updated");
      else toast.error(res.error);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {[false, true].map((m) => (
          <button
            key={String(m)}
            type="button"
            aria-pressed={manual === m}
            onClick={() => setManual(m)}
            className={cn("rounded-[10px] border px-3 py-2 text-sm font-semibold", manual === m ? "border-iron bg-iron text-iron-fg" : "border-line text-steel hover:border-iron")}
          >
            {m ? "Custom" : "Automatic"}
          </button>
        ))}
      </div>
      <p className="text-xs text-steel">
        {manual ? "Set your own daily targets." : "Calculated from your profile and latest weight; updates when you log weight."}
      </p>
      <div className="grid grid-cols-4 gap-2">
        <Label>kcal<Input name="kcal" type="number" defaultValue={initial.targetKcal} disabled={!manual} className="num" /></Label>
        <Label>Protein g<Input name="protein" type="number" defaultValue={initial.targetProteinG} disabled={!manual} className="num" /></Label>
        <Label>Carbs g<Input name="carbs" type="number" defaultValue={initial.targetCarbsG} disabled={!manual} className="num" /></Label>
        <Label>Fat g<Input name="fat" type="number" defaultValue={initial.targetFatG} disabled={!manual} className="num" /></Label>
      </div>
      <Button type="submit" variant="secondary" disabled={pending}>Save targets</Button>
    </form>
  );
}

"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Scale } from "lucide-react";
import { logBodyMetric } from "@/server/profile";
import { displayWeight, inputWeightToKg, weightUnit, type UnitSystem } from "@/lib/units";
import { Button, Input } from "@/components/ui";

export function WeightQuickLog({ date, units, current }: { date: string; units: UnitSystem; current: number | null }) {
  const [value, setValue] = useState(current ? String(displayWeight(current, units)) : "");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(value);
    if (!n) return;
    startTransition(async () => {
      const res = await logBodyMetric({ localDate: date, weightKg: inputWeightToKg(n, units), bodyFatPct: null, waistCm: null });
      if (res.ok) toast.success("Weight logged. Targets updated.");
      else toast.error(res.error);
    });
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <Scale className="size-5 shrink-0 text-steel" />
      <Input
        type="number"
        inputMode="decimal"
        step="0.1"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={`Today's weight (${weightUnit(units)})`}
        aria-label={`Today's weight in ${weightUnit(units)}`}
        className="num"
      />
      <Button type="submit" variant="secondary" disabled={pending || !value}>
        Log
      </Button>
    </form>
  );
}

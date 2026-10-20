"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Scale } from "lucide-react";
import { logBodyMetric } from "@/server/profile";
import { displayWeight, inputWeightToKg, weightUnit, type UnitSystem } from "@/lib/units";
import { Button, Input } from "@/components/ui";
import { useT } from "@/i18n/client";

export function WeightQuickLog({ date, units, current }: { date: string; units: UnitSystem; current: number | null }) {
  const [value, setValue] = useState(current ? String(displayWeight(current, units)) : "");
  const [pending, startTransition] = useTransition();
  const t = useT();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(value);
    if (!n) return;
    startTransition(async () => {
      const res = await logBodyMetric({ localDate: date, weightKg: inputWeightToKg(n, units), bodyFatPct: null, waistCm: null });
      if (res.ok) toast.success(t("today.weightLogged"));
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
        placeholder={t("today.weightPlaceholder", { unit: weightUnit(units) })}
        aria-label={t("today.weightAria", { unit: weightUnit(units) })}
        className="num"
      />
      <Button type="submit" variant="secondary" disabled={pending || !value}>
        {t("today.logWeight")}
      </Button>
    </form>
  );
}

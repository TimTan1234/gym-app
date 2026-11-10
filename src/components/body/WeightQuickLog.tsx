"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { logBodyMetric } from "@/server/profile";
import { inputWeightToKg, weightUnit, type UnitSystem } from "@/lib/units";
import { Button, Input } from "@/components/ui";
import { useT } from "@/i18n/client";

/** Today's weight in one short field; the card above it already shows the latest value. */
export function WeightQuickLog({ date, units }: { date: string; units: UnitSystem }) {
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();
  const t = useT();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(value);
    if (!n) return;
    startTransition(async () => {
      const res = await logBodyMetric({ localDate: date, weightKg: inputWeightToKg(n, units) });
      if (!res.ok) return void toast.error(res.error);
      toast.success(t("today.weightLogged"));
      setValue("");
    });
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <Input
        type="number"
        inputMode="decimal"
        step="0.1"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={weightUnit(units)}
        aria-label={t("today.weightAria", { unit: weightUnit(units) })}
        className="num w-24"
      />
      <Button type="submit" variant="secondary" disabled={pending || !value}>
        {t("today.logWeight")}
      </Button>
    </form>
  );
}

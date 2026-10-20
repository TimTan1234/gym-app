"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { deleteBodyMetric, logBodyMetric } from "@/server/profile";
import { formatLocalDate } from "@/lib/dates";
import { cmToIn, displayWeight, inToCm, inputWeightToKg, round, weightUnit, type UnitSystem } from "@/lib/units";
import { Button, Input } from "@/components/ui";
import { useT } from "@/i18n/client";
import { INTL_LOCALE } from "@/i18n/config";

interface Entry {
  id: string;
  localDate: string;
  weightKg: number;
  bodyFatPct: number | null;
  waistCm: number | null;
}

export function BodyMetricsLog({ today, units, entries }: { today: string; units: UnitSystem; entries: Entry[] }) {
  const [pending, startTransition] = useTransition();
  const t = useT();
  const lenUnit = units === "IMPERIAL" ? "in" : "cm";

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const opt = (k: string) => (f.get(k) ? Number(f.get(k)) : null);
    const waist = opt("waist");
    startTransition(async () => {
      const res = await logBodyMetric({
        localDate: String(f.get("date")),
        weightKg: inputWeightToKg(Number(f.get("weight")), units),
        bodyFatPct: opt("bodyFat"),
        waistCm: waist === null ? null : units === "IMPERIAL" ? inToCm(waist) : waist,
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success(t("progress.log.saved"));
      form.reset();
    });
  }

  return (
    <div className="space-y-3">
      <form onSubmit={submit} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <label className="text-[11px] font-medium text-steel sm:col-span-1">
          {t("progress.log.date")}
          <Input name="date" type="date" defaultValue={today} max={today} required className="mt-0.5" />
        </label>
        <label className="text-[11px] font-medium text-steel">
          {t("progress.log.weight", { unit: weightUnit(units) })}
          <Input name="weight" type="number" step="0.1" inputMode="decimal" required className="num mt-0.5" />
        </label>
        <label className="text-[11px] font-medium text-steel">
          {t("progress.log.bodyFat")}
          <Input name="bodyFat" type="number" step="0.1" inputMode="decimal" placeholder={t("common.optional")} className="num mt-0.5" />
        </label>
        <label className="text-[11px] font-medium text-steel">
          {t("progress.log.waist", { unit: lenUnit })}
          <Input name="waist" type="number" step="0.1" inputMode="decimal" placeholder={t("common.optional")} className="num mt-0.5" />
        </label>
        <Button type="submit" disabled={pending} className="self-end">
          {t("common.save")}
        </Button>
      </form>
      {entries.length > 0 && (
        <ul className="num max-h-56 divide-y divide-line overflow-y-auto text-sm">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center gap-3 py-1.5">
              <span className="w-24 text-steel">{formatLocalDate(e.localDate, undefined, INTL_LOCALE[t.locale])}</span>
              <span className="flex-1 font-semibold">
                {displayWeight(e.weightKg, units)} {weightUnit(units)}
              </span>
              {e.bodyFatPct !== null && <span className="text-steel">{e.bodyFatPct}%</span>}
              {e.waistCm !== null && (
                <span className="text-steel">
                  {round(units === "IMPERIAL" ? cmToIn(e.waistCm) : e.waistCm, 1)} {lenUnit}
                </span>
              )}
              <button
                type="button"
                aria-label={t("progress.log.deleteEntry", { date: e.localDate })}
                disabled={pending}
                onClick={() => startTransition(async () => void (await deleteBodyMetric(e.id)))}
                className="p-1 text-steel hover:text-alert"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

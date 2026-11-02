"use client";

import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { setTargets } from "@/server/profile";
import { Button, Input, Label, cn, segmentClass, segmentTrack } from "@/components/ui";
import { useT } from "@/i18n/client";

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
  const t = useT();

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
      if (res.ok) toast.success(t("settings.targets.updated"));
      else toast.error(res.error);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className={segmentTrack(true)}>
        {[false, true].map((m) => (
          <button
            key={String(m)}
            type="button"
            aria-pressed={manual === m}
            onClick={() => setManual(m)}
            className={segmentClass(manual === m, true)}
          >
            {m ? t("settings.targets.custom") : t("settings.targets.automatic")}
          </button>
        ))}
      </div>
      {/* Automatic targets are read, not edited, so they show as figures. The fields stay mounted (hidden),
          so switching to Custom starts from these numbers. */}
      {!manual && (
        <div className="space-y-3 pt-1">
          <p className="score text-[44px] leading-none">
            {initial.targetKcal.toLocaleString()}
            <span className="ml-2 font-sans text-[15px] text-steel">{t("settings.targets.kcalPerDay")}</span>
          </p>
          <dl className="grid grid-cols-3 gap-3">
            {([
              ["protein", initial.targetProteinG, "bg-protein"],
              ["carbs", initial.targetCarbsG, "bg-carbs"],
              ["fat", initial.targetFatG, "bg-fat"],
            ] as const).map(([key, grams, dot]) => (
              <div key={key} className="flex flex-col-reverse">
                <dt className="flex items-center gap-1.5 text-[13px] text-steel">
                  <span aria-hidden className={cn("size-2 rounded-full", dot)} />
                  {t(`settings.targets.${key}`)}
                </dt>
                <dd className="score text-[24px]">
                  {grams}
                  <span className="ml-0.5 font-sans text-sm text-steel">g</span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-steel">{t("settings.targets.autoHint")}</p>
        </div>
      )}
      {manual && <p className="text-xs text-steel">{t("settings.targets.customHint")}</p>}
      {/* Short labels with the unit inside the box, so no label wraps; 2×2 where four don't fit. */}
      <div className={cn("grid grid-cols-2 items-end gap-x-2 gap-y-3 min-[23rem]:grid-cols-4", !manual && "hidden")}>
        <Label className="whitespace-nowrap">{t("settings.targets.kcal")}<Input name="kcal" type="number" defaultValue={initial.targetKcal} disabled={!manual} className="num" /></Label>
        <GramsField label={t("settings.targets.protein")} name="protein" value={initial.targetProteinG} disabled={!manual} />
        <GramsField label={t("settings.targets.carbs")} name="carbs" value={initial.targetCarbsG} disabled={!manual} />
        <GramsField label={t("settings.targets.fat")} name="fat" value={initial.targetFatG} disabled={!manual} />
      </div>
      {/* Nothing to save while targets stay automatic. */}
      {(manual || initial.targetsManual) && (
        <Button type="submit" variant="secondary" disabled={pending}>{t("settings.targets.save")}</Button>
      )}
    </form>
  );
}

/**
 * A grams field: the unit sits inside the box so the label stays one short word.
 * The unit is outside the <label>, so the field's name is just the label text.
 */
function GramsField({ label, name, value, disabled }: { label: string; name: string; value: number; disabled: boolean }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="whitespace-nowrap">
        {label}
      </Label>
      <div className="relative">
        <Input id={id} name={name} type="number" defaultValue={value} disabled={disabled} className="num pr-7" />
        <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-[15px] text-steel">
          g
        </span>
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveDiabetesSettings } from "@/server/profile";
import { DEFAULT_GLUCOSE_TARGETS, toDisplay, toMmol, unitLabel, type GlucoseUnit } from "@/lib/glucose";
import type { CarbBudget } from "@/lib/nutrition/diabetes";
import { Button, Input, Label, cn } from "@/components/ui";
import { useT } from "@/i18n/client";

export interface DiabetesSettingsValues {
  diabetesMode: boolean;
  diabetesType: "PREDIABETES" | "TYPE2" | null;
  hypoRiskMeds: boolean;
  glucoseUnit: GlucoseUnit;
  glucoseFastingMin: number;
  glucoseFastingMax: number;
  glucosePostMealMax: number;
}

/** Segmented choice, styled like the rest of settings. */
function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-2">
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn("rounded-[10px] border px-3 py-2 text-sm font-semibold", value === v ? "border-iron bg-iron text-iron-fg" : "border-line text-steel hover:border-iron")}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

export function DiabetesSettings({ initial, budget }: { initial: DiabetesSettingsValues; budget: CarbBudget }) {
  const t = useT();
  const [enabled, setEnabled] = useState(initial.diabetesMode);
  const [type, setType] = useState(initial.diabetesType ?? "TYPE2");
  const [meds, setMeds] = useState(initial.hypoRiskMeds);
  const [unit, setUnit] = useState(initial.glucoseUnit);
  // Targets are edited in the chosen unit and kept in mmol/L.
  const [targets, setTargets] = useState({ fastingMin: initial.glucoseFastingMin, fastingMax: initial.glucoseFastingMax, postMealMax: initial.glucosePostMealMax });
  const [pending, startTransition] = useTransition();

  const field = (key: keyof typeof targets, label: string) => (
    <Label>
      {label}
      <Input
        type="number"
        inputMode="decimal"
        step={unit === "MG_DL" ? 1 : 0.1}
        value={toDisplay(targets[key], unit)}
        onChange={(e) => setTargets((cur) => ({ ...cur, [key]: toMmol(Number(e.target.value) || 0, unit) }))}
        className="num"
      />
    </Label>
  );

  function save() {
    startTransition(async () => {
      const res = await saveDiabetesSettings({ enabled, type, hypoRiskMeds: meds, unit, ...targets });
      if (res.ok) toast.success(t("glucose.settings.saved"));
      else toast.error(res.error);
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-steel">{t("glucose.settings.intro")}</p>
      <label className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold">{t("glucose.settings.enable")}</span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={t("glucose.settings.enable")}
          onClick={() => setEnabled((e) => !e)}
          className={cn("relative h-7 w-12 shrink-0 rounded-full border transition-colors", enabled ? "border-iron bg-iron" : "border-line bg-wash")}
        >
          <span className={cn("absolute top-0.5 size-[22px] rounded-full bg-paper shadow transition-[left]", enabled ? "left-[22px]" : "left-0.5")} />
        </button>
      </label>

      {enabled && (
        <>
          <p className="rounded-[10px] border border-line bg-wash px-3 py-2 text-[13px]">{t("glucose.settings.disclaimer")}</p>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">{t("glucose.settings.type")}</p>
            <Choice
              label={t("glucose.settings.type")}
              value={type}
              onChange={setType}
              options={[
                ["TYPE2", t("glucose.settings.types.TYPE2")],
                ["PREDIABETES", t("glucose.settings.types.PREDIABETES")],
              ]}
            />
          </div>
          <label className="flex items-start gap-3">
            <input type="checkbox" checked={meds} onChange={(e) => setMeds(e.target.checked)} className="mt-1 size-4 accent-[var(--iron)]" />
            <span>
              <span className="block text-sm font-medium">{t("glucose.settings.meds")}</span>
              <span className="block text-xs text-steel">{t("glucose.settings.medsHint")}</span>
            </span>
          </label>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">{t("glucose.settings.unit")}</p>
            <Choice
              label={t("glucose.settings.unit")}
              value={unit}
              onChange={setUnit}
              options={[
                ["MMOL_L", unitLabel("MMOL_L")],
                ["MG_DL", unitLabel("MG_DL")],
              ]}
            />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              {t("glucose.settings.targets")} <span className="font-normal text-steel">({unitLabel(unit)})</span>
            </legend>
            <p className="text-xs text-steel">{t("glucose.settings.targetsHint")}</p>
            <p className="text-[13px] font-medium">{t("glucose.settings.fasting")}</p>
            <div className="grid grid-cols-2 gap-2">
              {field("fastingMin", t("glucose.settings.min"))}
              {field("fastingMax", t("glucose.settings.max"))}
            </div>
            <div className="grid grid-cols-2 gap-2">{field("postMealMax", t("glucose.settings.postMeal"))}</div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setTargets(DEFAULT_GLUCOSE_TARGETS)}>
              {t("glucose.settings.useGuideline")}
            </Button>
          </fieldset>
          <p className="text-xs text-steel">
            {t("glucose.settings.carbHint", { meal: `${budget.meal.min}–${budget.meal.max}`, snack: `${budget.snack.min}–${budget.snack.max}` })}
          </p>
        </>
      )}
      <Button type="button" variant="secondary" disabled={pending} onClick={save}>
        {t("glucose.settings.save")}
      </Button>
    </div>
  );
}

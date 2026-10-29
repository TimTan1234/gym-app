"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { logGlucose } from "@/server/glucose";
import { GLUCOSE_CONTEXTS, unitLabel, type GlucoseContext, type GlucoseStatus, type GlucoseUnit } from "@/lib/glucose";
import { toLocalTime } from "@/lib/dates";
import { Button, Input, Label, Select, cn } from "@/components/ui";
import { SafetyCard } from "./GlucoseBits";
import { useT } from "@/i18n/client";

export interface MealOption {
  id: string;
  description: string;
  /** "HH:MM" eaten, in the user's timezone. */
  time: string;
  eatenAtMs: number;
}

/** A meal eaten this recently is the likely subject of an after-meal reading. */
const LIKELY_MEAL_MS = 4 * 60 * 60 * 1000;

/** The latest meal eaten in the last few hours, if any. */
function likelyMeal(meals: MealOption[]): MealOption | undefined {
  const now = Date.now();
  return meals.filter((m) => now - m.eatenAtMs < LIKELY_MEAL_MS).sort((a, b) => b.eatenAtMs - a.eatenAtMs)[0];
}

export function GlucoseLogger({
  unit,
  timezone,
  today,
  nowTime,
  meals,
  initialContext = null,
  initialMealId = null,
}: {
  unit: GlucoseUnit;
  timezone: string;
  today: string;
  nowTime: string;
  meals: MealOption[];
  initialContext?: GlucoseContext | null;
  initialMealId?: string | null;
}) {
  const t = useT();
  const [value, setValue] = useState("");
  const [context, setContext] = useState<GlucoseContext>(initialContext ?? "FASTING");
  const [time, setTime] = useState(nowTime);
  const [mealId, setMealId] = useState<string | null>(initialMealId);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<GlucoseStatus | null>(null);
  const [pending, startTransition] = useTransition();

  function pickContext(c: GlucoseContext) {
    setContext(c);
    if (c === "AFTER_MEAL" && !mealId) setMealId(likelyMeal(meals)?.id ?? null);
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    const submitted = value;
    const n = Number(submitted.replace(",", "."));
    if (!n) return;
    startTransition(async () => {
      const res = await logGlucose({
        value: n,
        context,
        localDate: today,
        time,
        mealId: context === "AFTER_MEAL" ? mealId : null,
        note: note.trim() || null,
      });
      if (!res.ok) return void toast.error(res.error);
      setResult(res.status ?? null);
      toast.success(t("glucose.log.saved"));
      // Keep anything typed while the save was in flight.
      setValue((v) => (v === submitted ? "" : v));
      setNote("");
      setTime(toLocalTime(new Date(), timezone));
    });
  }

  return (
    <div className="space-y-4">
      {result && <SafetyCard status={result} unit={unit} />}
      <form onSubmit={save} className="space-y-3" aria-label={t("glucose.log.title")}>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Label>
            {t("glucose.log.value", { unit: unitLabel(unit) })}
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              inputMode="decimal"
              required
              autoComplete="off"
              className="num h-12 text-[22px] font-semibold"
            />
          </Label>
          <Label>
            {t("glucose.log.time")}
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} required className="num h-12" />
          </Label>
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium">{t("glucose.log.when")}</p>
          <div role="radiogroup" aria-label={t("glucose.log.when")} className="grid grid-cols-3 gap-2">
            {GLUCOSE_CONTEXTS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={context === c}
                onClick={() => pickContext(c)}
                className={cn(
                  "rounded-field border px-2 py-2 text-xs font-semibold sm:text-sm",
                  context === c ? "border-iron bg-iron text-iron-fg" : "border-line text-steel hover:border-iron",
                )}
              >
                {t(`glucose.context.${c}`)}
              </button>
            ))}
          </div>
        </div>
        {context === "AFTER_MEAL" && meals.length > 0 && (
          <Label>
            {t("glucose.log.meal")}
            <Select value={mealId ?? ""} onChange={(e) => setMealId(e.target.value || null)}>
              <option value="">{t("glucose.log.noMeal")}</option>
              {meals.map((m) => (
                <option key={m.id} value={m.id}>
                  {t("glucose.log.mealOption", { meal: m.description, time: m.time })}
                </option>
              ))}
            </Select>
          </Label>
        )}
        <Label>
          {t("glucose.log.note")}
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
        </Label>
        <Button type="submit" disabled={pending || !value} className="w-full">
          {t("glucose.log.save")}
        </Button>
      </form>
    </div>
  );
}

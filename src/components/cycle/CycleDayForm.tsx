"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Plus } from "lucide-react";
import { deleteCycleDay, saveCycleDay } from "@/server/cycle";
import {
  BUILT_IN_SYMPTOMS,
  FLOWS,
  MAX_CUSTOM_SYMPTOM_CHARS,
  MOODS,
  SEVERITIES,
  isBuiltInSymptom,
  type FlowValue,
  type MoodValue,
  type Severity,
  type SymptomEntry,
} from "@/lib/cycle/symptoms";
import { Button, Card, Input, SwitchRow, Textarea, chipClass, cn, segmentClass, segmentTrack } from "@/components/ui";
import { useConfirmTap } from "./useConfirmTap";
import { useT } from "@/i18n/client";

export interface CycleDayValues {
  periodStart: boolean;
  periodEnd: boolean;
  flow: FlowValue | null;
  symptoms: SymptomEntry[];
  mood: MoodValue | null;
  pain: number | null;
  energy: number | null;
  note: string;
}

/** One choice of a few as radio buttons; picking the selected one again clears it when `clearable`. */
function Choice<V extends string | number>({
  label,
  value,
  options,
  onChange,
  clearable = false,
}: {
  label: string;
  value: V | null;
  options: [V, string][];
  onChange: (v: V | null) => void;
  clearable?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={segmentTrack(true)}>
      {options.map(([v, text]) => (
        <button
          key={String(v)}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(clearable && value === v ? null : v)}
          className={segmentClass(value === v, true)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

function Field({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 flex w-full items-baseline justify-between gap-3">
        <span className="text-sm font-semibold">{title}</span>
        {hint && <span className="text-xs text-steel">{hint}</span>}
      </legend>
      {children}
    </fieldset>
  );
}

export function CycleDayForm({ date, initial, exists, customSymptoms }: { date: string; initial: CycleDayValues; exists: boolean; customSymptoms: string[] }) {
  const t = useT();
  const [v, setV] = useState(initial);
  const [custom, setCustom] = useState(customSymptoms);
  const [newSymptom, setNewSymptom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof CycleDayValues>(key: K, value: CycleDayValues[K]) => setV((cur) => ({ ...cur, [key]: value }));

  const label = (name: string) => (isBuiltInSymptom(name) ? t(`cycle.symptom.${name}`) : name);
  const severityOf = (name: string) => v.symptoms.find((s) => s.name === name)?.severity;
  const toggleSymptom = (name: string) =>
    set("symptoms", severityOf(name) ? v.symptoms.filter((s) => s.name !== name) : [...v.symptoms, { name, severity: "MILD" }]);
  const setSeverity = (name: string, severity: Severity) => set("symptoms", v.symptoms.map((s) => (s.name === name ? { ...s, severity } : s)));

  function addCustom() {
    const name = newSymptom.trim().slice(0, MAX_CUSTOM_SYMPTOM_CHARS);
    if (!name) return;
    const known = [...BUILT_IN_SYMPTOMS, ...custom].find((s) => label(s).toLocaleLowerCase() === name.toLocaleLowerCase() || s.toLocaleLowerCase() === name.toLocaleLowerCase());
    if (known) {
      if (!severityOf(known)) toggleSymptom(known);
      else toast.error(t("cycle.errors.symptomExists"));
    } else {
      setCustom((cur) => [...cur, name]);
      set("symptoms", [...v.symptoms, { name, severity: "MILD" }]);
    }
    setNewSymptom("");
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      // On success the action opens the overview itself; only a refusal comes back.
      const res = await saveCycleDay({ localDate: date, ...v, note: v.note.trim() || null });
      if (!res.ok) setError(res.error);
    });
  }

  const remove = useConfirmTap(() =>
    startTransition(async () => {
      const res = await deleteCycleDay(date);
      if (!res.ok) toast.error(res.error);
    }),
  );

  const all = [...BUILT_IN_SYMPTOMS, ...custom];

  return (
    <form aria-label={t("cycle.log.form")} onSubmit={save} className="space-y-7">
      <Card className="space-y-1 py-3">
        <SwitchRow label={t("cycle.log.periodStarted")} checked={v.periodStart} onChange={(c) => set("periodStart", c)} />
        <SwitchRow label={t("cycle.log.periodEnded")} checked={v.periodEnd} onChange={(c) => set("periodEnd", c)} />
        {error && (
          <p role="alert" className="pb-1 text-sm text-alert">
            {error}
          </p>
        )}
      </Card>

      <Field title={t("cycle.log.flow")}>
        <Choice
          label={t("cycle.log.flow")}
          value={v.flow ?? "NONE"}
          onChange={(f) => set("flow", f === "NONE" || f === null ? null : f)}
          options={[["NONE", t("cycle.log.none")], ...FLOWS.map((f): [FlowValue, string] => [f, t(`cycle.flow.${f}`)])]}
        />
      </Field>

      <Field title={t("cycle.log.symptoms")}>
        <div className="flex flex-wrap gap-2">
          {all.map((name) => {
            const on = !!severityOf(name);
            return (
              <button key={name} type="button" aria-pressed={on} onClick={() => toggleSymptom(name)} className={chipClass(on)}>
                {on && <Check className="size-4" aria-hidden />}
                {label(name)}
              </button>
            );
          })}
        </div>
        {v.symptoms.length > 0 && (
          <ul className="space-y-2 pt-2">
            {v.symptoms.map((s) => (
              <li key={s.name} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                <span className="text-sm font-medium">{label(s.name)}</span>
                <div role="radiogroup" aria-label={t("cycle.log.severityOf", { symptom: label(s.name) })} className={segmentTrack()}>
                  {SEVERITIES.map((sev) => (
                    <button
                      key={sev}
                      type="button"
                      role="radio"
                      aria-checked={s.severity === sev}
                      onClick={() => setSeverity(s.name, sev)}
                      className={cn(segmentClass(s.severity === sev), "px-3 text-[13px]")}
                    >
                      {t(`cycle.severity.${sev}`)}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2 pt-2">
          <Input
            value={newSymptom}
            maxLength={MAX_CUSTOM_SYMPTOM_CHARS}
            placeholder={t("cycle.log.addSymptomPlaceholder")}
            aria-label={t("cycle.log.addSymptom")}
            onChange={(e) => setNewSymptom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
          />
          <Button type="button" variant="secondary" onClick={addCustom} disabled={!newSymptom.trim()}>
            <Plus className="size-4" /> {t("cycle.log.add")}
          </Button>
        </div>
      </Field>

      <Field title={t("cycle.log.mood")}>
        <Choice label={t("cycle.log.mood")} value={v.mood} clearable onChange={(m) => set("mood", m)} options={MOODS.map((m): [MoodValue, string] => [m, t(`cycle.mood.${m}`)])} />
      </Field>

      <Field title={t("cycle.log.pain")} hint={t("cycle.log.painHint")}>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={0}
            max={10}
            step={1}
            value={v.pain ?? 0}
            aria-label={t("cycle.log.pain")}
            aria-valuetext={v.pain === null ? t("cycle.log.notRecorded") : String(v.pain)}
            onChange={(e) => set("pain", Number(e.target.value))}
            // A tap on the thumb at 0 changes nothing, so it records the value itself.
            onClick={(e) => v.pain === null && set("pain", Number(e.currentTarget.value))}
            className={cn("h-11 flex-1 accent-[var(--iron)]", v.pain === null && "opacity-50")}
          />
          <span className={cn("w-10 text-right", v.pain === null ? "text-sm text-steel" : "score text-[28px]")}>{v.pain ?? "–"}</span>
        </div>
        <div className="flex items-center justify-between text-xs text-steel">
          <span>{v.pain === null ? t("cycle.log.notRecorded") : ""}</span>
          {v.pain !== null && (
            <button type="button" onClick={() => set("pain", null)} className="min-h-9 px-1 hover:text-iron">
              {t("cycle.log.clear")}
            </button>
          )}
        </div>
      </Field>

      <Field title={t("cycle.log.energy")} hint={t("cycle.log.energyHint")}>
        <Choice label={t("cycle.log.energy")} value={v.energy} clearable onChange={(n) => set("energy", n)} options={[1, 2, 3, 4, 5].map((n): [number, string] => [n, String(n)])} />
      </Field>

      <Field title={t("cycle.log.note")}>
        <Textarea value={v.note} maxLength={1000} placeholder={t("cycle.log.notePlaceholder")} aria-label={t("cycle.log.note")} onChange={(e) => set("note", e.target.value)} />
      </Field>

      <div className="sticky bottom-20 z-20 md:bottom-4">
        <Card className="flex items-center justify-between gap-3 border border-line p-3 shadow-[0_8px_24px_-12px_rgba(20,20,19,0.45)]">
          {exists ? (
            <Button type="button" variant="danger" onClick={remove.tap} disabled={pending}>
              {remove.armed ? t("cycle.confirmDelete") : t("cycle.log.deleteDay")}
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? t("common.saving") : t("cycle.log.save")}
          </Button>
        </Card>
      </div>
    </form>
  );
}

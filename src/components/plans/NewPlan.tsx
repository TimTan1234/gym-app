"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, PencilRuler, Sparkles } from "lucide-react";
import type { PlanRequest } from "@/lib/ai/schemas";
import type { ResolvedPlanDraft } from "@/lib/ai/plan";
import type { PickerExercise } from "@/components/train/ExercisePicker";
import { EQUIPMENT_OPTIONS } from "@/components/profile/options";
import { Button, Card, Label, Select, Textarea, cn } from "@/components/ui";
import { PlanEditor, editorKey, type EditorPlan } from "./PlanEditor";
import { useT } from "@/i18n/client";

const GOALS: PlanRequest["goal"][] = ["HYPERTROPHY", "STRENGTH", "FAT_LOSS", "GENERAL_FITNESS", "ENDURANCE"];
const EXPERIENCE: PlanRequest["experience"][] = ["BEGINNER", "INTERMEDIATE", "ADVANCED"];
const FOCUS = ["chest", "back", "shoulders", "arms", "legs", "glutes", "core"] as const;

function fromDraft(d: ResolvedPlanDraft, goal: string): EditorPlan {
  return {
    name: d.name,
    goal,
    weeks: d.weeks,
    notes: d.notes,
    source: "AI",
    days: d.days.map((day) => ({
      key: editorKey(),
      name: day.name,
      exercises: day.exercises.map((e) => ({
        key: editorKey(),
        exerciseId: e.exerciseId,
        exerciseName: e.exerciseName,
        exerciseSlug: e.exerciseSlug,
        sets: e.sets,
        repMin: e.repMin,
        repMax: e.repMax,
        targetRpe: e.targetRpe,
        restSec: e.restSec,
        notes: e.notes,
      })),
    })),
  };
}

export function NewPlan({
  library,
  defaults,
}: {
  library: PickerExercise[];
  defaults: { experience: PlanRequest["experience"]; equipment: string[]; goal: PlanRequest["goal"] };
}) {
  const t = useT();
  const [mode, setMode] = useState<"ai" | "manual">("ai");
  const [goal, setGoal] = useState(defaults.goal);
  const [days, setDays] = useState(4);
  const [minutes, setMinutes] = useState(60);
  const [experience, setExperience] = useState(defaults.experience);
  const [equipment, setEquipment] = useState<string[]>(defaults.equipment.length ? defaults.equipment : ["dumbbell"]);
  const [focus, setFocus] = useState<string[]>([]);
  const [limitations, setLimitations] = useState("");
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<EditorPlan | null>(null);
  const [manualKey, setManualKey] = useState(0);

  async function generate() {
    setLoading(true);
    try {
      const body: PlanRequest = { goal, daysPerWeek: days, sessionMinutes: minutes, experience, equipment, focusMuscles: focus, limitations };
      const res = await fetch("/api/ai/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json()) as { draft?: ResolvedPlanDraft; error?: string };
      if (!res.ok || !data.draft) throw new Error(data.error ?? t("plans.generator.failed"));
      setDraft(fromDraft(data.draft, goal));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("plans.generator.failed"));
    } finally {
      setLoading(false);
    }
  }

  if (draft) {
    return (
      <div className="space-y-3">
        <p className="rounded-[10px] bg-wash px-3 py-2 text-sm">
          <Sparkles className="mr-1.5 inline size-4" />
          {t("plans.generator.draftIntro")}
        </p>
        <PlanEditor initial={draft} library={library} onSaved={() => setDraft(null)} />
        <Button variant="ghost" className="w-full" onClick={() => setDraft(null)}>
          {t("plans.generator.startOver")}
        </Button>
      </div>
    );
  }

  const chip = (on: boolean) =>
    cn("rounded-full border px-3 py-1.5 text-sm", on ? "border-iron bg-iron font-semibold text-iron-fg" : "border-line text-steel hover:border-iron");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" aria-pressed={mode === "ai"} onClick={() => setMode("ai")} className={cn("flex items-center justify-center gap-2 rounded-[10px] border py-2.5 text-sm font-semibold", mode === "ai" ? "border-iron bg-iron text-iron-fg" : "border-line text-steel hover:border-iron")}>
          <Sparkles className="size-4" /> {t("plans.generator.withAi")}
        </button>
        <button type="button" aria-pressed={mode === "manual"} onClick={() => setMode("manual")} className={cn("flex items-center justify-center gap-2 rounded-[10px] border py-2.5 text-sm font-semibold", mode === "manual" ? "border-iron bg-iron text-iron-fg" : "border-line text-steel hover:border-iron")}>
          <PencilRuler className="size-4" /> {t("plans.generator.manually")}
        </button>
      </div>

      {mode === "manual" ? (
        <PlanEditor
          key={manualKey}
          library={library}
          onSaved={() => setManualKey((k) => k + 1)}
          initial={{ name: t("plans.generator.defaultName"), goal: "CUSTOM", weeks: 8, notes: null, source: "MANUAL", days: [{ key: editorKey(), name: t("plans.editor.day", { n: 1 }), exercises: [] }] }}
        />
      ) : (
        <Card className="space-y-4">
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">{t("plans.generator.goal")}</legend>
            <div className="flex flex-wrap gap-2">
              {GOALS.map((g) => (
                <button key={g} type="button" aria-pressed={goal === g} onClick={() => setGoal(g)} className={chip(goal === g)}>
                  {t(`plans.goals.${g}`)}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <Label>
              {t("plans.generator.daysPerWeek")}
              <Select value={days} onChange={(e) => setDays(Number(e.target.value))}>
                {[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </Label>
            <Label>
              {t("plans.generator.minutesPerSession")}
              <Select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
                {[30, 45, 60, 75, 90].map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </Label>
            <Label className="col-span-2">
              {t("plans.generator.experience")}
              <Select value={experience} onChange={(e) => setExperience(e.target.value as PlanRequest["experience"])}>
                {EXPERIENCE.map((v) => (
                  <option key={v} value={v}>{t(`labels.experience.${v}`)}</option>
                ))}
              </Select>
            </Label>
          </div>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">{t("plans.generator.equipment")}</legend>
            <div className="flex flex-wrap gap-2">
              {EQUIPMENT_OPTIONS.filter((o) => o.value !== "cardio_machine").map(({ value }) => {
                const on = equipment.includes(value);
                return (
                  <button key={value} type="button" aria-pressed={on} onClick={() => setEquipment((c) => (on ? c.filter((x) => x !== value) : [...c, value]))} className={chip(on)}>
                    {t(`labels.equipmentOption.${value}`)}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">{t("plans.generator.focus")}</legend>
            <div className="flex flex-wrap gap-2">
              {FOCUS.map((m) => {
                const on = focus.includes(m);
                return (
                  <button key={m} type="button" aria-pressed={on} onClick={() => setFocus((c) => (on ? c.filter((x) => x !== m) : [...c, m]))} className={cn(chip(on), "capitalize")}>
                    {t(`plans.focusMuscle.${m}`)}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <Label hint={t("plans.generator.limitationsHint")}>
            {t("plans.generator.limitations")}
            <Textarea value={limitations} onChange={(e) => setLimitations(e.target.value)} placeholder={t("plans.generator.limitationsPlaceholder")} maxLength={500} />
          </Label>
          <Button size="lg" className="w-full" onClick={generate} disabled={loading || equipment.length === 0}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {loading ? t("plans.generator.designing") : t("plans.generator.generate")}
          </Button>
        </Card>
      )}
    </div>
  );
}

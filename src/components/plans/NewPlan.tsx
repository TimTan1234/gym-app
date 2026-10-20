"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, PencilRuler, Sparkles } from "lucide-react";
import type { PlanRequest } from "@/lib/ai/schemas";
import type { ResolvedPlanDraft } from "@/lib/ai/plan";
import type { PickerExercise } from "@/components/train/ExercisePicker";
import { EQUIPMENT_OPTIONS, EXPERIENCE_LABELS } from "@/components/profile/options";
import { Button, Card, Label, Select, Textarea, cn } from "@/components/ui";
import { PlanEditor, editorKey, type EditorPlan } from "./PlanEditor";

const GOALS: { value: PlanRequest["goal"]; label: string }[] = [
  { value: "HYPERTROPHY", label: "Build muscle" },
  { value: "STRENGTH", label: "Get stronger" },
  { value: "FAT_LOSS", label: "Lose fat" },
  { value: "GENERAL_FITNESS", label: "General fitness" },
  { value: "ENDURANCE", label: "Muscular endurance" },
];

const FOCUS = ["chest", "back", "shoulders", "arms", "legs", "glutes", "core"];

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
      if (!res.ok || !data.draft) throw new Error(data.error ?? "Generation failed");
      setDraft(fromDraft(data.draft, goal));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  }

  if (draft) {
    return (
      <div className="space-y-3">
        <p className="rounded-[10px] bg-wash px-3 py-2 text-sm">
          <Sparkles className="mr-1.5 inline size-4" />
          Here&apos;s your AI draft. Adjust anything, then save.
        </p>
        <PlanEditor initial={draft} library={library} onSaved={() => setDraft(null)} />
        <Button variant="ghost" className="w-full" onClick={() => setDraft(null)}>
          Start over
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
          <Sparkles className="size-4" /> Generate with AI
        </button>
        <button type="button" aria-pressed={mode === "manual"} onClick={() => setMode("manual")} className={cn("flex items-center justify-center gap-2 rounded-[10px] border py-2.5 text-sm font-semibold", mode === "manual" ? "border-iron bg-iron text-iron-fg" : "border-line text-steel hover:border-iron")}>
          <PencilRuler className="size-4" /> Build manually
        </button>
      </div>

      {mode === "manual" ? (
        <PlanEditor
          key={manualKey}
          library={library}
          onSaved={() => setManualKey((k) => k + 1)}
          initial={{ name: "My plan", goal: "CUSTOM", weeks: 8, notes: null, source: "MANUAL", days: [{ key: editorKey(), name: "Day 1", exercises: [] }] }}
        />
      ) : (
        <Card className="space-y-4">
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">Goal</legend>
            <div className="flex flex-wrap gap-2">
              {GOALS.map((g) => (
                <button key={g.value} type="button" aria-pressed={goal === g.value} onClick={() => setGoal(g.value)} className={chip(goal === g.value)}>
                  {g.label}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <Label>
              Days a week
              <Select value={days} onChange={(e) => setDays(Number(e.target.value))}>
                {[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </Label>
            <Label>
              Minutes per session
              <Select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
                {[30, 45, 60, 75, 90].map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </Label>
            <Label className="col-span-2">
              Training experience
              <Select value={experience} onChange={(e) => setExperience(e.target.value as PlanRequest["experience"])}>
                {Object.entries(EXPERIENCE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </Select>
            </Label>
          </div>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">Equipment</legend>
            <div className="flex flex-wrap gap-2">
              {EQUIPMENT_OPTIONS.filter((o) => o.value !== "cardio_machine").map(({ value, label }) => {
                const on = equipment.includes(value);
                return (
                  <button key={value} type="button" aria-pressed={on} onClick={() => setEquipment((c) => (on ? c.filter((x) => x !== value) : [...c, value]))} className={chip(on)}>
                    {label}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">Extra focus (optional)</legend>
            <div className="flex flex-wrap gap-2">
              {FOCUS.map((m) => {
                const on = focus.includes(m);
                return (
                  <button key={m} type="button" aria-pressed={on} onClick={() => setFocus((c) => (on ? c.filter((x) => x !== m) : [...c, m]))} className={cn(chip(on), "capitalize")}>
                    {m}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <Label hint="The AI avoids exercises that load injured areas. See a professional for pain.">
            Injuries or limitations
            <Textarea value={limitations} onChange={(e) => setLimitations(e.target.value)} placeholder="e.g. lower back sensitive to heavy deadlifts" maxLength={500} />
          </Label>
          <Button size="lg" className="w-full" onClick={generate} disabled={loading || equipment.length === 0}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {loading ? "Designing your plan…" : "Generate plan"}
          </Button>
        </Card>
      )}
    </div>
  );
}

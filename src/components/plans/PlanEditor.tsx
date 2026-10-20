"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { createPlan, updatePlan } from "@/server/plans";
import type { PlanInput } from "@/lib/plan-input";
import { ExercisePicker, type PickerExercise } from "@/components/train/ExercisePicker";
import { Button, Card, Input, Label, Textarea } from "@/components/ui";

export interface EditorExercise {
  key: string;
  exerciseId: string;
  exerciseName: string;
  sets: number;
  repMin: number;
  repMax: number;
  targetRpe: number | null;
  restSec: number;
  notes: string | null;
}

export interface EditorPlan {
  name: string;
  goal: string;
  weeks: number;
  notes: string | null;
  source: "AI" | "MANUAL";
  days: { key: string; name: string; exercises: EditorExercise[] }[];
}

let seq = 0;
export const editorKey = () => `k${++seq}`;

function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const copy = [...arr];
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
}

export function PlanEditor({
  initial,
  library,
  planId,
  onSaved,
}: {
  initial: EditorPlan;
  library: PickerExercise[];
  /** Existing plan id when editing; omitted when creating. */
  planId?: string;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [plan, setPlan] = useState(initial);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const setDay = (key: string, fn: (d: EditorPlan["days"][number]) => EditorPlan["days"][number]) =>
    setPlan((p) => ({ ...p, days: p.days.map((d) => (d.key === key ? fn(d) : d)) }));

  const setEx = (dayKey: string, exKey: string, patch: Partial<EditorExercise>) =>
    setDay(dayKey, (d) => ({ ...d, exercises: d.exercises.map((e) => (e.key === exKey ? { ...e, ...patch } : e)) }));

  function addExercise(ex: PickerExercise) {
    if (!pickerFor) return;
    setDay(pickerFor, (d) => ({
      ...d,
      exercises: [
        ...d.exercises,
        { key: editorKey(), exerciseId: ex.id, exerciseName: ex.name, sets: 3, repMin: 8, repMax: 12, targetRpe: 8, restSec: 90, notes: null },
      ],
    }));
    setPickerFor(null);
  }

  function save(activate: boolean) {
    const input: PlanInput = {
      name: plan.name,
      goal: plan.goal,
      weeks: plan.weeks,
      notes: plan.notes,
      source: plan.source,
      days: plan.days.map((d) => ({
        name: d.name,
        exercises: d.exercises.map(({ key: _k, exerciseName: _n, ...e }) => e),
      })),
    };
    startTransition(async () => {
      const res = planId ? await updatePlan(planId, input) : await createPlan(input, activate);
      if (!res.ok) return void toast.error(res.error);
      toast.success(planId ? "Plan updated" : activate ? "Plan saved and activated" : "Plan saved");
      onSaved?.();
      router.push("/train/plans");
    });
  }

  const num = (v: string, fallback: number) => (Number.isFinite(Number(v)) && v !== "" ? Number(v) : fallback);

  return (
    <div className="space-y-4">
      <Card className="grid grid-cols-[1fr_6rem] gap-3">
        <Label>
          Plan name
          <Input value={plan.name} onChange={(e) => setPlan({ ...plan, name: e.target.value })} maxLength={80} />
        </Label>
        <Label>
          Weeks
          <Input type="number" min={1} max={52} value={plan.weeks} onChange={(e) => setPlan({ ...plan, weeks: num(e.target.value, 8) })} />
        </Label>
        <Label className="col-span-2">
          Notes
          <Textarea value={plan.notes ?? ""} onChange={(e) => setPlan({ ...plan, notes: e.target.value || null })} maxLength={1000} />
        </Label>
      </Card>

      {plan.days.map((day, di) => (
        <Card key={day.key} className="space-y-3" data-testid="plan-day">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-steel">DAY {di + 1}</span>
            <Input
              value={day.name}
              onChange={(e) => setDay(day.key, (d) => ({ ...d, name: e.target.value }))}
              aria-label={`Day ${di + 1} name`}
              className="font-semibold"
              maxLength={60}
            />
            <Button variant="ghost" size="sm" aria-label="Move day up" onClick={() => setPlan((p) => ({ ...p, days: move(p.days, di, -1) }))}>
              <ArrowUp className="size-4" />
            </Button>
            <Button variant="ghost" size="sm" aria-label="Remove day" onClick={() => setPlan((p) => ({ ...p, days: p.days.filter((d) => d.key !== day.key) }))}>
              <Trash2 className="size-4" />
            </Button>
          </div>

          <ul className="space-y-2">
            {day.exercises.map((ex, ei) => (
              <li key={ex.key} className="rounded-xl bg-wash p-2.5">
                <div className="mb-2 flex items-center gap-1">
                  <span className="flex-1 text-sm font-semibold">{ex.exerciseName}</span>
                  <button type="button" aria-label="Move up" className="p-1 text-steel hover:text-iron" onClick={() => setDay(day.key, (d) => ({ ...d, exercises: move(d.exercises, ei, -1) }))}>
                    <ArrowUp className="size-3.5" />
                  </button>
                  <button type="button" aria-label="Move down" className="p-1 text-steel hover:text-iron" onClick={() => setDay(day.key, (d) => ({ ...d, exercises: move(d.exercises, ei, 1) }))}>
                    <ArrowDown className="size-3.5" />
                  </button>
                  <button type="button" aria-label={`Remove ${ex.exerciseName}`} className="p-1 text-steel hover:text-alert" onClick={() => setDay(day.key, (d) => ({ ...d, exercises: d.exercises.filter((e) => e.key !== ex.key) }))}>
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-5 gap-1.5 text-[11px] font-medium text-steel">
                  {(
                    [
                      ["Sets", "sets", 3],
                      ["Min reps", "repMin", 8],
                      ["Max reps", "repMax", 12],
                      ["Rest s", "restSec", 90],
                    ] as const
                  ).map(([lbl, field, fb]) => (
                    <label key={field}>
                      {lbl}
                      <Input type="number" min={1} value={ex[field]} onChange={(e) => setEx(day.key, ex.key, { [field]: num(e.target.value, fb) })} className="num h-9 px-2 text-center" />
                    </label>
                  ))}
                  <label>
                    RPE
                    <Input
                      type="number"
                      min={5}
                      max={10}
                      step={0.5}
                      value={ex.targetRpe ?? ""}
                      onChange={(e) => setEx(day.key, ex.key, { targetRpe: e.target.value ? Number(e.target.value) : null })}
                      className="num h-9 px-2 text-center"
                    />
                  </label>
                </div>
                {ex.notes && <p className="mt-1.5 text-xs italic text-steel">{ex.notes}</p>}
              </li>
            ))}
          </ul>
          <Button variant="ghost" size="sm" onClick={() => setPickerFor(day.key)}>
            <Plus className="size-4" /> Add exercise
          </Button>
        </Card>
      ))}

      {plan.days.length < 7 && (
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => setPlan((p) => ({ ...p, days: [...p.days, { key: editorKey(), name: `Day ${p.days.length + 1}`, exercises: [] }] }))}
        >
          <Plus className="size-4" /> Add training day
        </Button>
      )}

      <div className="flex gap-2">
        {planId ? (
          <Button size="lg" className="flex-1" onClick={() => save(false)} disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        ) : (
          <>
            <Button size="lg" variant="secondary" className="flex-1" onClick={() => save(false)} disabled={pending}>
              Save
            </Button>
            <Button size="lg" className="flex-1" onClick={() => save(true)} disabled={pending}>
              {pending ? "Saving…" : "Save & activate"}
            </Button>
          </>
        )}
      </div>

      {pickerFor && <ExercisePicker exercises={library} onPick={addExercise} onClose={() => setPickerFor(null)} />}
    </div>
  );
}

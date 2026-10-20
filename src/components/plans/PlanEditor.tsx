"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { createPlan, updatePlan } from "@/server/plans";
import type { PlanInput } from "@/lib/plan-input";
import { ExercisePicker, type PickerExercise } from "@/components/train/ExercisePicker";
import { Button, Input, Label, Textarea, cn } from "@/components/ui";

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

const FIELDS = [
  ["Sets", "sets", 3],
  ["Min reps", "repMin", 8],
  ["Max reps", "repMax", 12],
  ["Rest (s)", "restSec", 90],
] as const;
// Sets | min | max | rest | RPE: shared by the header row and every exercise row.
const FIELD_COLS = "grid grid-cols-5 gap-1.5";

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
    <div className="space-y-8">
      <div className="grid grid-cols-[1fr_6rem] gap-3">
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
      </div>

      {plan.days.map((day, di) => (
        // Each day reads like a page of the logbook: a heavy rule, one header row, then divided exercise rows.
        <section key={day.key} className="space-y-2 border-t-2 border-iron pt-3" data-testid="plan-day">
          <div className="flex items-center gap-1">
            <span className="shrink-0 text-[13px] font-semibold text-steel">Day {di + 1}</span>
            <Input
              value={day.name}
              onChange={(e) => setDay(day.key, (d) => ({ ...d, name: e.target.value }))}
              aria-label={`Day ${di + 1} name`}
              className="display h-10 border-transparent bg-transparent px-2 text-[22px] hover:border-line focus:border-iron"
              maxLength={60}
            />
            <Button variant="ghost" size="sm" aria-label="Move day up" onClick={() => setPlan((p) => ({ ...p, days: move(p.days, di, -1) }))}>
              <ArrowUp className="size-4" />
            </Button>
            <Button variant="ghost" size="sm" aria-label="Remove day" onClick={() => setPlan((p) => ({ ...p, days: p.days.filter((d) => d.key !== day.key) }))}>
              <Trash2 className="size-4" />
            </Button>
          </div>

          {day.exercises.length > 0 && (
            <div aria-hidden className={cn(FIELD_COLS, "border-b border-line pb-1.5 text-center text-[12px] font-medium text-steel")}>
              {FIELDS.map(([lbl]) => (
                <span key={lbl}>{lbl}</span>
              ))}
              <span>RPE</span>
            </div>
          )}
          <ul className="divide-y divide-line">
            {day.exercises.map((ex, ei) => (
              <li key={ex.key} className="space-y-1.5 py-2.5">
                <div className="flex items-center gap-0.5">
                  <span className="flex-1 font-semibold">{ex.exerciseName}</span>
                  <button type="button" aria-label="Move up" className="rounded-[8px] p-1.5 text-steel hover:bg-wash hover:text-iron" onClick={() => setDay(day.key, (d) => ({ ...d, exercises: move(d.exercises, ei, -1) }))}>
                    <ArrowUp className="size-4" />
                  </button>
                  <button type="button" aria-label="Move down" className="rounded-[8px] p-1.5 text-steel hover:bg-wash hover:text-iron" onClick={() => setDay(day.key, (d) => ({ ...d, exercises: move(d.exercises, ei, 1) }))}>
                    <ArrowDown className="size-4" />
                  </button>
                  <button type="button" aria-label={`Remove ${ex.exerciseName}`} className="rounded-[8px] p-1.5 text-steel hover:bg-wash hover:text-alert" onClick={() => setDay(day.key, (d) => ({ ...d, exercises: d.exercises.filter((e) => e.key !== ex.key) }))}>
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <div className={FIELD_COLS}>
                  {FIELDS.map(([lbl, field, fb]) => (
                    <Input
                      key={field}
                      aria-label={`${ex.exerciseName} ${lbl.toLowerCase()}`}
                      type="number"
                      min={1}
                      value={ex[field]}
                      onChange={(e) => setEx(day.key, ex.key, { [field]: num(e.target.value, fb) })}
                      className="num h-10 px-1 text-center"
                    />
                  ))}
                  <Input
                    aria-label={`${ex.exerciseName} target RPE`}
                    type="number"
                    min={5}
                    max={10}
                    step={0.5}
                    placeholder="–"
                    value={ex.targetRpe ?? ""}
                    onChange={(e) => setEx(day.key, ex.key, { targetRpe: e.target.value ? Number(e.target.value) : null })}
                    className="num h-10 px-1 text-center"
                  />
                </div>
                {ex.notes && <p className="text-[13px] italic text-steel">{ex.notes}</p>}
              </li>
            ))}
          </ul>
          <Button variant="ghost" size="sm" onClick={() => setPickerFor(day.key)}>
            <Plus className="size-4" /> Add exercise
          </Button>
        </section>
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

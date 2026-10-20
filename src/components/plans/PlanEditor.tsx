"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { createPlan, updatePlan } from "@/server/plans";
import type { PlanInput } from "@/lib/plan-input";
import { ExercisePicker, type PickerExercise } from "@/components/train/ExercisePicker";
import { Button, Input, Label, Textarea, cn } from "@/components/ui";
import { useT } from "@/i18n/client";
import { exerciseName } from "@/i18n/labels";

export interface EditorExercise {
  key: string;
  exerciseId: string;
  exerciseName: string;
  /** Library slug, used to show the exercise name in the interface language. */
  exerciseSlug: string;
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
  ["plans.editor.sets", "sets", 3],
  ["plans.editor.minReps", "repMin", 8],
  ["plans.editor.maxReps", "repMax", 12],
  ["plans.editor.rest", "restSec", 90],
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
  const t = useT();
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
        { key: editorKey(), exerciseId: ex.id, exerciseName: ex.name, exerciseSlug: ex.slug ?? "", sets: 3, repMin: 8, repMax: 12, targetRpe: 8, restSec: 90, notes: null },
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
        exercises: d.exercises.map(({ key: _k, exerciseName: _n, exerciseSlug: _s, ...e }) => e),
      })),
    };
    startTransition(async () => {
      const res = planId ? await updatePlan(planId, input) : await createPlan(input, activate);
      if (!res.ok) return void toast.error(res.error);
      toast.success(planId ? t("plans.editor.updated") : activate ? t("plans.editor.savedActivated") : t("plans.editor.saved"));
      onSaved?.();
      router.push("/train/plans");
    });
  }

  const num = (v: string, fallback: number) => (Number.isFinite(Number(v)) && v !== "" ? Number(v) : fallback);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <Label>
          {t("plans.editor.planName")}
          <Input value={plan.name} onChange={(e) => setPlan({ ...plan, name: e.target.value })} maxLength={80} />
        </Label>
        <Label>
          {t("plans.editor.weeks")}
          <Input type="number" min={1} max={52} value={plan.weeks} onChange={(e) => setPlan({ ...plan, weeks: num(e.target.value, 8) })} />
        </Label>
        <Label className="col-span-2">
          {t("plans.editor.notes")}
          <Textarea value={plan.notes ?? ""} onChange={(e) => setPlan({ ...plan, notes: e.target.value || null })} maxLength={1000} />
        </Label>
      </div>

      {plan.days.map((day, di) => (
        // Each day reads like a page of the logbook: a heavy rule, one header row, then divided exercise rows.
        <section key={day.key} className="space-y-2 border-t-2 border-iron pt-3" data-testid="plan-day">
          <div className="flex items-center gap-1">
            <span className="shrink-0 text-[13px] font-semibold text-steel">{t("plans.editor.day", { n: di + 1 })}</span>
            <Input
              value={day.name}
              onChange={(e) => setDay(day.key, (d) => ({ ...d, name: e.target.value }))}
              aria-label={t("plans.editor.dayName", { n: di + 1 })}
              className="display h-10 border-transparent bg-transparent px-2 text-[22px] hover:border-line focus:border-iron"
              maxLength={60}
            />
            <Button variant="ghost" size="sm" aria-label={t("plans.editor.moveDayUp")} onClick={() => setPlan((p) => ({ ...p, days: move(p.days, di, -1) }))}>
              <ArrowUp className="size-4" />
            </Button>
            <Button variant="ghost" size="sm" aria-label={t("plans.editor.removeDay")} onClick={() => setPlan((p) => ({ ...p, days: p.days.filter((d) => d.key !== day.key) }))}>
              <Trash2 className="size-4" />
            </Button>
          </div>

          {day.exercises.length > 0 && (
            <div aria-hidden className={cn(FIELD_COLS, "border-b border-line pb-1.5 text-center text-[12px] font-medium text-steel")}>
              {FIELDS.map(([lbl]) => (
                <span key={lbl}>{t(lbl)}</span>
              ))}
              <span>{t("plans.editor.rpe")}</span>
            </div>
          )}
          <ul className="divide-y divide-line">
            {day.exercises.map((ex, ei) => {
              const name = exerciseName(t, { slug: ex.exerciseSlug, name: ex.exerciseName });
              return (
                <li key={ex.key} className="space-y-1.5 py-2.5">
                  <div className="flex items-center gap-0.5">
                    <span className="flex-1 font-semibold">{name}</span>
                    <button type="button" aria-label={t("plans.editor.moveUp")} className="rounded-[8px] p-1.5 text-steel hover:bg-wash hover:text-iron" onClick={() => setDay(day.key, (d) => ({ ...d, exercises: move(d.exercises, ei, -1) }))}>
                      <ArrowUp className="size-4" />
                    </button>
                    <button type="button" aria-label={t("plans.editor.moveDown")} className="rounded-[8px] p-1.5 text-steel hover:bg-wash hover:text-iron" onClick={() => setDay(day.key, (d) => ({ ...d, exercises: move(d.exercises, ei, 1) }))}>
                      <ArrowDown className="size-4" />
                    </button>
                    <button type="button" aria-label={t("plans.editor.remove", { name })} className="rounded-[8px] p-1.5 text-steel hover:bg-wash hover:text-alert" onClick={() => setDay(day.key, (d) => ({ ...d, exercises: d.exercises.filter((e) => e.key !== ex.key) }))}>
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <div className={FIELD_COLS}>
                    {FIELDS.map(([lbl, field, fb]) => (
                      <Input
                        key={field}
                        aria-label={t("plans.editor.fieldLabel", { exercise: name, field: t(lbl).toLowerCase() })}
                        type="number"
                        min={1}
                        value={ex[field]}
                        onChange={(e) => setEx(day.key, ex.key, { [field]: num(e.target.value, fb) })}
                        className="num h-10 px-1 text-center"
                      />
                    ))}
                    <Input
                      aria-label={t("plans.editor.targetRpe", { exercise: name })}
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
              );
            })}
          </ul>
          <Button variant="ghost" size="sm" onClick={() => setPickerFor(day.key)}>
            <Plus className="size-4" /> {t("plans.editor.addExercise")}
          </Button>
        </section>
      ))}

      {plan.days.length < 7 && (
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => setPlan((p) => ({ ...p, days: [...p.days, { key: editorKey(), name: t("plans.editor.day", { n: p.days.length + 1 }), exercises: [] }] }))}
        >
          <Plus className="size-4" /> {t("plans.editor.addDay")}
        </Button>
      )}

      <div className="flex gap-2">
        {planId ? (
          <Button size="lg" className="flex-1" onClick={() => save(false)} disabled={pending}>
            {pending ? t("common.saving") : t("plans.editor.saveChanges")}
          </Button>
        ) : (
          <>
            <Button size="lg" variant="secondary" className="flex-1" onClick={() => save(false)} disabled={pending}>
              {t("plans.editor.save")}
            </Button>
            <Button size="lg" className="flex-1" onClick={() => save(true)} disabled={pending}>
              {pending ? t("common.saving") : t("plans.editor.saveActivate")}
            </Button>
          </>
        )}
      </div>

      {pickerFor && <ExercisePicker exercises={library} onPick={addExercise} onClose={() => setPickerFor(null)} />}
    </div>
  );
}

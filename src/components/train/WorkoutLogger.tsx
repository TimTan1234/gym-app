"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Plus, Trash2, TrendingUp, Trophy, History } from "lucide-react";
import { deleteSet, discardWorkout, finishWorkout, getLastSets, logSet, type LoggedSet } from "@/server/training";
import { suggestNext } from "@/lib/training/progression";
import { RECORD_LABELS } from "@/lib/training/records";
import { displayWeight, formatWeight, inputWeightToKg, weightUnit, type UnitSystem } from "@/lib/units";
import { formatLocalDate } from "@/lib/dates";
import { Button, Card, Input, Textarea, cn } from "@/components/ui";
import { ExercisePicker, type PickerExercise } from "./ExercisePicker";
import { RestTimerBar, useRestTimer } from "./RestTimer";
import { PlateLoad } from "./PlateLoad";

export interface Target {
  sets: number;
  repMin: number;
  repMax: number;
  restSec: number;
  targetRpe: number | null;
  notes: string | null;
}

export interface Block {
  exercise: PickerExercise;
  target: Target | null;
  last: { date: string; sets: { weightKg: number; reps: number; isWarmup: boolean }[] } | null;
}

const DEFAULT_RANGE = { repMin: 8, repMax: 12 };
const DEFAULT_REST = 90;

function useElapsed(startedAt: string) {
  const [text, setText] = useState("");
  useEffect(() => {
    const tick = () => {
      const s = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      setText(h ? `${h}h ${m}m` : `${m}:${String(s % 60).padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return text;
}

export function WorkoutLogger({
  sessionId,
  startedAt,
  title,
  initialBlocks,
  initialSets,
  library,
  units,
}: {
  sessionId: string;
  startedAt: string;
  title: string;
  initialBlocks: Block[];
  initialSets: LoggedSet[];
  library: PickerExercise[];
  units: UnitSystem;
}) {
  const router = useRouter();
  const timer = useRestTimer();
  const elapsed = useElapsed(startedAt);
  const [blocks, setBlocks] = useState(initialBlocks);
  const [sets, setSets] = useState(initialSets);
  const [picking, setPicking] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();

  async function addExercise(ex: PickerExercise) {
    setPicking(false);
    if (blocks.some((b) => b.exercise.id === ex.id)) return;
    setBlocks((cur) => [...cur, { exercise: ex, target: null, last: null }]);
    const last = await getLastSets(ex.id, sessionId);
    if (last) setBlocks((cur) => cur.map((b) => (b.exercise.id === ex.id ? { ...b, last } : b)));
  }

  function onLogged(set: LoggedSet, records: { type: keyof typeof RECORD_LABELS; value: number }[], restSec: number) {
    setSets((cur) => [...cur, set]);
    for (const r of records) {
      const value = r.type === "MAX_VOLUME_SET" ? `${Math.round(displayWeight(r.value, units, 0))} ${weightUnit(units)}` : formatWeight(r.value, units);
      toast.success(`New PR! ${RECORD_LABELS[r.type]}: ${value}`, { icon: <Trophy className="size-4" /> });
    }
    timer.start(set.isWarmup ? 60 : restSec);
  }

  function finish() {
    startTransition(async () => {
      const res = await finishWorkout(sessionId, notes);
      if (!res.ok) return void toast.error(res.error);
      timer.stop();
      if (res.discarded) {
        toast("Empty workout discarded");
        router.push("/train");
      } else {
        toast.success("Workout saved");
        router.push(`/train/history/${sessionId}`);
      }
    });
  }

  function discard() {
    if (!confirm("Discard this workout and all its sets?")) return;
    startTransition(async () => {
      await discardWorkout(sessionId);
      timer.stop();
      router.push("/train");
    });
  }

  const workingSets = sets.filter((s) => !s.isWarmup).length;

  return (
    <div className="pb-16">
      <header className="sticky top-0 z-30 -mx-4 flex items-center justify-between gap-3 border-b border-line bg-chalk px-4 py-3">
        <div className="min-w-0">
          <h1 className="display truncate text-[22px]">{title}</h1>
          <p className="num text-[13px] text-steel">
            {elapsed} elapsed, {workingSets} working {workingSets === 1 ? "set" : "sets"}
          </p>
        </div>
        <Button onClick={() => setFinishing(true)} disabled={pending}>
          <Check className="size-4" /> Finish
        </Button>
      </header>

      <div className="divide-y divide-line">
      {blocks.map((block) => (
        <ExerciseBlock
          key={block.exercise.id}
          block={block}
          sessionId={sessionId}
          sets={sets.filter((s) => s.exerciseId === block.exercise.id)}
          units={units}
          onLogged={onLogged}
          onDeleted={(id) => setSets((cur) => {
            const removed = cur.find((s) => s.id === id);
            return cur
              .filter((s) => s.id !== id)
              .map((s) => (removed && s.exerciseId === removed.exerciseId && s.setIndex > removed.setIndex ? { ...s, setIndex: s.setIndex - 1 } : s));
          })}
        />
      ))}
      </div>

      <Button variant="secondary" className="mt-4 w-full" size="lg" onClick={() => setPicking(true)}>
        <Plus className="size-5" /> Add exercise
      </Button>
      <Button variant="ghost" className="mt-2 w-full text-alert" onClick={discard} disabled={pending}>
        Discard workout
      </Button>

      {picking && <ExercisePicker exercises={library} onPick={addExercise} onClose={() => setPicking(false)} />}

      {finishing && (
        <div role="dialog" aria-modal="true" aria-label="Finish workout" className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
          <Card className="w-full max-w-md space-y-3 rounded-b-none sm:rounded-2xl">
            <h2 className="display text-[22px]">Finish workout?</h2>
            <p className="text-sm text-steel">
              {workingSets} working {workingSets === 1 ? "set" : "sets"} across {new Set(sets.map((s) => s.exerciseId)).size} exercises in {elapsed}.
            </p>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="How did it feel? (optional)" maxLength={1000} />
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setFinishing(false)}>
                Keep going
              </Button>
              <Button className="flex-1" onClick={finish} disabled={pending}>
                {pending ? "Saving…" : "Save workout"}
              </Button>
            </div>
          </Card>
        </div>
      )}

      <RestTimerBar timer={timer} />
    </div>
  );
}

function ExerciseBlock({
  block,
  sessionId,
  sets,
  units,
  onLogged,
  onDeleted,
}: {
  block: Block;
  sessionId: string;
  sets: LoggedSet[];
  units: UnitSystem;
  onLogged: (set: LoggedSet, records: { type: keyof typeof RECORD_LABELS; value: number }[], restSec: number) => void;
  onDeleted: (id: string) => void;
}) {
  const { exercise, target, last } = block;
  const range = target ?? DEFAULT_RANGE;
  const suggestion = last ? suggestNext({ lastSets: last.sets, repMin: range.repMin, repMax: range.repMax, isLowerBody: exercise.isLowerBody }) : null;
  const lastLogged = sets.at(-1);
  const firstWorkingLast = last?.sets.find((s) => !s.isWarmup);

  const defaultKg = lastLogged?.weightKg ?? suggestion?.weightKg ?? firstWorkingLast?.weightKg ?? 0;
  const defaultReps = lastLogged?.reps ?? suggestion?.reps ?? range.repMin;

  // null = untouched: show the derived default (last set / suggestion), which
  // also updates when "last time" data arrives for an exercise added mid-workout.
  const [weightInput, setWeight] = useState<string | null>(null);
  const [repsInput, setReps] = useState<string | null>(null);
  const weight = weightInput ?? (defaultKg ? String(displayWeight(defaultKg, units, 2)) : "");
  const reps = repsInput ?? String(defaultReps);
  const [rpe, setRpe] = useState("");
  const [warmup, setWarmup] = useState(false);
  const [pending, startTransition] = useTransition();

  function log() {
    const w = Number(weight || 0);
    const r = Number(reps);
    if (!Number.isFinite(w) || w < 0 || !Number.isInteger(r) || r <= 0) {
      toast.error("Enter weight and reps");
      return;
    }
    startTransition(async () => {
      const res = await logSet({
        sessionId,
        exerciseId: exercise.id,
        weightKg: inputWeightToKg(w, units),
        reps: r,
        rpe: rpe ? Math.min(10, Math.max(1, Number(rpe))) : null,
        isWarmup: warmup,
      });
      if (!res.ok) return void toast.error(res.error);
      onLogged(res.set, res.records, target?.restSec ?? DEFAULT_REST);
      setWarmup(false);
      setRpe("");
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await deleteSet(id);
      if (res.ok) onDeleted(id);
      else toast.error(res.error);
    });
  }

  const workingDone = sets.filter((s) => !s.isWarmup).length;
  const unit = weightUnit(units);
  const lastWorking = last?.sets.filter((s) => !s.isWarmup) ?? [];
  const nextIndex = warmup ? "W" : String(workingDone + 1);
  // Set | weight | reps | RPE | action: shared by the header, logged rows and the entry row.
  const cols = "grid grid-cols-[2.25rem_1fr_1fr_3.75rem_2.75rem] items-center gap-2";

  return (
    <section className="space-y-3 py-6" data-testid="exercise-block">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="display text-[22px]">{exercise.name}</h2>
          {target && (
            <p className="num mt-0.5 text-[13px] text-steel">
              {target.sets} sets of {target.repMin}–{target.repMax}
              {target.targetRpe ? `, RPE ${target.targetRpe}` : ""}, rest {Math.round((target.restSec / 60) * 10) / 10} min
            </p>
          )}
          {target?.notes && <p className="mt-0.5 text-[13px] italic text-steel">{target.notes}</p>}
        </div>
        {target && (
          // Target sets as plates; one fills in per working set logged.
          <div role="img" aria-label={`${workingDone} of ${target.sets} sets done`} className="flex shrink-0 gap-1 pt-1.5">
            {Array.from({ length: target.sets }, (_, i) => (
              <span
                key={i}
                className={cn("h-5 w-2 rounded-[2px] border", i < workingDone ? "border-iron bg-iron" : "border-steel/50")}
              />
            ))}
          </div>
        )}
      </div>

      {last && (
        <div className="space-y-0.5 text-[13px]">
          <p className="flex items-center gap-1.5 text-steel">
            <History className="size-3.5 shrink-0" aria-hidden />
            Last time, {formatLocalDate(last.date, { weekday: undefined })}:
            <span className="num text-iron">
              {lastWorking.length ? lastWorking.map((s) => `${displayWeight(s.weightKg, units)}×${s.reps}`).join(", ") : "warm-ups only"}
            </span>
          </p>
          {suggestion && (
            <p className="flex items-start gap-1.5">
              <TrendingUp className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                <span className="font-semibold">
                  Try {formatWeight(suggestion.weightKg, units)} × {suggestion.reps}.
                </span>{" "}
                <span className="text-steel">{suggestion.reason}</span>
              </span>
            </p>
          )}
        </div>
      )}

      <div role="table" aria-label={`${exercise.name} sets`} className="text-center">
        <div role="row" className={cn(cols, "border-b border-line pb-1.5 text-[12px] font-medium text-steel")}>
          <span role="columnheader">Set</span>
          <span role="columnheader">{unit}</span>
          <span role="columnheader">Reps</span>
          <span role="columnheader">RPE</span>
          <span role="columnheader" className="sr-only">Actions</span>
        </div>
        {sets.map((s) => (
          <div role="row" key={s.id} className={cn(cols, "border-b border-line py-1.5")}>
            <span role="cell" className={cn("text-sm font-semibold", s.isWarmup ? "text-steel" : "")}>{s.isWarmup ? "W" : s.setIndex}</span>
            <span role="cell" className="score text-[24px]">{displayWeight(s.weightKg, units)}</span>
            <span role="cell" className="score text-[24px]">{s.reps}</span>
            <span role="cell" className="num text-sm text-steel">{s.rpe ?? "–"}</span>
            <span role="cell">
              <button
                type="button"
                aria-label={`Delete set ${s.isWarmup ? "warm-up" : s.setIndex}`}
                onClick={() => remove(s.id)}
                disabled={pending}
                className="rounded-[8px] p-2 text-steel hover:bg-wash hover:text-alert"
              >
                <Trash2 className="size-4" />
              </button>
            </span>
          </div>
        ))}
        {/* The entry row is the next line of the log. */}
        <div role="row" className={cn(cols, "pt-2")}>
          <span role="cell" className="text-sm font-semibold text-steel">{nextIndex}</span>
          <span role="cell">
            <Input aria-label={unit} type="number" inputMode="decimal" step="any" min={0} value={weight} onChange={(e) => setWeight(e.target.value)} className="score h-12 px-1 text-center text-[24px]" />
          </span>
          <span role="cell">
            <Input aria-label="Reps" type="number" inputMode="numeric" min={1} value={reps} onChange={(e) => setReps(e.target.value)} className="score h-12 px-1 text-center text-[24px]" />
          </span>
          <span role="cell">
            <Input aria-label="RPE" type="number" inputMode="decimal" min={1} max={10} step={0.5} value={rpe} onChange={(e) => setRpe(e.target.value)} placeholder="–" className="num h-12 px-1 text-center" />
          </span>
          <span role="cell">
            <Button onClick={log} disabled={pending} className="h-12 w-full px-0" aria-label={`Log set for ${exercise.name}`}>
              <Check className="size-5" />
            </Button>
          </span>
        </div>
      </div>
      {exercise.equipment === "barbell" && Number(weight) > 0 && <PlateLoad weight={Number(weight)} units={units} />}
      <label className="flex w-fit items-center gap-2 text-[13px] text-steel">
        <input type="checkbox" checked={warmup} onChange={(e) => setWarmup(e.target.checked)} className="size-4 accent-[var(--iron)]" />
        This is a warm-up set
      </label>
    </section>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, CloudOff, Plus, Trash2, TrendingUp, Trophy, History } from "lucide-react";
import { deleteSet, discardWorkout, finishWorkout, getLastSets, logSet, removeWorkoutExercise, swapWorkoutExercise, type LoggedSet, type SetInput } from "@/server/training";
import { suggestNext } from "@/lib/training/progression";
import { currentExercise } from "@/lib/training/summary";
import { newSetId, pendingSets, usePendingSets } from "@/lib/training/pending-sets";
import { swapOptions } from "@/lib/training/swap";
import type { RecordType } from "@/lib/training/records";
import { displayWeight, formatWeight, inputWeightToKg, weightUnit, type UnitSystem } from "@/lib/units";
import { formatLocalDate } from "@/lib/dates";
import { useT } from "@/i18n/client";
import { INTL_LOCALE } from "@/i18n/config";
import { exerciseName } from "@/i18n/labels";
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

/** A set on screen: saved, or still waiting on the phone for a connection. */
type ShownSet = LoggedSet & { pending?: boolean };
type SetValues = Pick<SetInput, "weightKg" | "reps" | "rpe" | "isWarmup">;

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
  equipment,
  units,
}: {
  sessionId: string;
  startedAt: string;
  title: string;
  initialBlocks: Block[];
  initialSets: LoggedSet[];
  library: PickerExercise[];
  /** The user's equipment, for swap suggestions. */
  equipment: string[];
  units: UnitSystem;
}) {
  const router = useRouter();
  const t = useT();
  const timer = useRestTimer();
  const elapsed = useElapsed(startedAt);
  const [blocks, setBlocks] = useState(initialBlocks);
  const [sets, setSets] = useState(initialSets);
  const [picking, setPicking] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();
  // Exercises taken out of this workout, kept so adding one back restores its planned target.
  const [removed, setRemoved] = useState<Record<string, Block>>({});
  const [swapping, setSwapping] = useState<Block | null>(null);
  const queued = usePendingSets(sessionId);
  // Saved sets, then the ones waiting on the phone, in the order they were logged.
  const shown: ShownSet[] = [
    ...sets,
    ...queued
      .filter((q) => !sets.some((s) => s.id === q.input.id))
      .map(({ input, setIndex }) => ({ id: input.id, exerciseId: input.exerciseId, setIndex, weightKg: input.weightKg, reps: input.reps, rpe: input.rpe, isWarmup: input.isWarmup, pending: true })),
  ];
  const offline = () => void toast.error(t("train.offline"));

  async function addExercise(ex: PickerExercise) {
    setPicking(false);
    if (blocks.some((b) => b.exercise.id === ex.id)) return;
    const back = removed[ex.id];
    if (back) return void setBlocks((cur) => [...cur, back]);
    setBlocks((cur) => [...cur, { exercise: ex, target: null, last: null }]);
    const last = await getLastSets(ex.id, sessionId);
    if (last) setBlocks((cur) => cur.map((b) => (b.exercise.id === ex.id ? { ...b, last } : b)));
  }

  const onSaved = useCallback(
    (set: LoggedSet, records: { type: RecordType; value: number }[]) => {
      setSets((cur) => (cur.some((s) => s.id === set.id) ? cur : [...cur, set]));
      for (const r of records) {
        const value = r.type === "MAX_VOLUME_SET" ? `${Math.round(displayWeight(r.value, units, 0))} ${weightUnit(units)}` : formatWeight(r.value, units);
        toast.success(t("train.newPr", { type: t(`labels.record.${r.type}`), value }), { icon: <Trophy className="size-4" /> });
      }
    },
    [t, units],
  );

  // Sends the queued sets in order, one at a time; stops at the first that can't get through.
  const flushing = useRef(false);
  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      for (const p of pendingSets.read(sessionId)) {
        let res: Awaited<ReturnType<typeof logSet>>;
        try {
          res = await logSet(p.input);
        } catch {
          return; // Still no connection: try again later.
        }
        if (res.ok) onSaved(res.set, res.records);
        else toast.error(res.error);
        pendingSets.remove(sessionId, [p.input.id]);
      }
    } finally {
      flushing.current = false;
    }
  }, [sessionId, onSaved]);

  useEffect(() => {
    void flush();
    const onOnline = () => void flush();
    window.addEventListener("online", onOnline);
    const id = setInterval(() => {
      if (pendingSets.read(sessionId).length) void flush();
    }, 15_000);
    return () => {
      window.removeEventListener("online", onOnline);
      clearInterval(id);
    };
  }, [flush, sessionId]);

  /** Saves a set, or keeps it on the phone when there's no connection. False when it was refused. */
  async function log(block: Block, values: SetValues): Promise<boolean> {
    const restSec = values.isWarmup ? 60 : (block.target?.restSec ?? DEFAULT_REST);
    const input: SetInput = { id: newSetId(), completedAt: new Date().toISOString(), sessionId, exerciseId: block.exercise.id, ...values };
    // Behind sets still waiting, a new one waits its turn so the set numbers stay in order.
    if (pendingSets.read(sessionId).length === 0) {
      try {
        const res = await logSet(input);
        if (!res.ok) {
          toast.error(res.error);
          return false;
        }
        onSaved(res.set, res.records);
        timer.start(restSec);
        return true;
      } catch {
        // No connection: keep it on the phone, below.
      }
    }
    const setIndex = shown.filter((s) => s.exerciseId === block.exercise.id).length + 1;
    pendingSets.add(sessionId, { input, setIndex, restSec });
    timer.start(restSec);
    void flush();
    return true;
  }

  function swapTo(block: Block, ex: PickerExercise) {
    setSwapping(null);
    if (ex.id === block.exercise.id || blocks.some((b) => b.exercise.id === ex.id)) return;
    const from = exerciseName(t, { slug: block.exercise.slug ?? "", name: block.exercise.name });
    const to = exerciseName(t, { slug: ex.slug ?? "", name: ex.name });
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof swapWorkoutExercise>>;
      try {
        res = await swapWorkoutExercise(sessionId, block.exercise.id, ex.id);
      } catch {
        return offline();
      }
      if (!res.ok) return void toast.error(res.error);
      // The new exercise takes over the slot: same place, same planned target.
      setBlocks((cur) => cur.map((b) => (b.exercise.id === block.exercise.id ? { exercise: ex, target: block.target, last: null } : b)));
      toast(t("train.swapped", { from, to }));
      const last = await getLastSets(ex.id, sessionId).catch(() => null);
      if (last) setBlocks((cur) => cur.map((b) => (b.exercise.id === ex.id ? { ...b, last } : b)));
    });
  }

  function removeExercise(block: Block) {
    const name = exerciseName(t, { slug: block.exercise.slug ?? "", name: block.exercise.name });
    const logged = shown.filter((s) => s.exerciseId === block.exercise.id).length;
    if (logged > 0 && !confirm(t("train.removeExerciseConfirm", { exercise: name, sets: t.plural("train.setCount", logged) }))) return;
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof removeWorkoutExercise>>;
      try {
        res = await removeWorkoutExercise(sessionId, block.exercise.id);
      } catch {
        return offline();
      }
      if (!res.ok) return void toast.error(res.error);
      pendingSets.remove(sessionId, queued.filter((q) => q.input.exerciseId === block.exercise.id).map((q) => q.input.id));
      setBlocks((cur) => cur.filter((b) => b.exercise.id !== block.exercise.id));
      setSets((cur) => cur.filter((s) => s.exerciseId !== block.exercise.id));
      setRemoved((cur) => ({ ...cur, [block.exercise.id]: block }));
      toast(t("train.exerciseRemoved", { exercise: name }));
    });
  }

  /** Finish needs every set on the server first: with none there, finishing would discard the workout. */
  async function syncedForFinish() {
    if (pendingSets.read(sessionId).length) await flush();
    const left = pendingSets.read(sessionId).length;
    if (left) toast.error(t.plural("train.finishWaiting", left));
    return left === 0;
  }

  function finish() {
    startTransition(async () => {
      if (!(await syncedForFinish())) return void setFinishing(false);
      let res: Awaited<ReturnType<typeof finishWorkout>>;
      try {
        res = await finishWorkout(sessionId, notes);
      } catch {
        return offline();
      }
      if (!res.ok) return void toast.error(res.error);
      timer.stop();
      if (res.discarded) {
        toast(t("train.emptyDiscarded"));
        router.push("/train");
      } else {
        toast.success(t("train.saved"));
        router.push(`/train/history/${sessionId}`);
      }
    });
  }

  function discard() {
    if (!confirm(t("train.discardConfirm"))) return;
    startTransition(async () => {
      try {
        await discardWorkout(sessionId);
      } catch {
        return offline();
      }
      pendingSets.clear(sessionId);
      timer.stop();
      router.push("/train");
    });
  }

  const workingSets = shown.filter((s) => !s.isWarmup).length;
  const exerciseCount = new Set(shown.map((s) => s.exerciseId)).size;
  const currentId = currentExercise(
    blocks.map((b) => ({ id: b.exercise.id, targetSets: b.target?.sets ?? null })),
    shown,
  );
  const current = blocks.find((b) => b.exercise.id === currentId);
  // Coral goes to the next thing to do: that exercise's Log set, or Finish once the plan is done.
  const planDone = blocks.length > 0 && !current;

  let next: { label: string; onGo?: () => void } | undefined;
  if (current) {
    const n = shown.filter((s) => s.exerciseId === current.exercise.id && !s.isWarmup).length + 1;
    const exercise = exerciseName(t, { slug: current.exercise.slug ?? "", name: current.exercise.name });
    next = {
      label: current.target ? t("train.upNext", { exercise, n, total: current.target.sets }) : t("train.upNextOpen", { exercise, n }),
      onGo: () => {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        document.getElementById(`log-${current.exercise.id}`)?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
      },
    };
  } else if (planDone) next = { label: t("train.allPlannedDone") };

  return (
    // Room under the last block for the rest timer when it's up.
    <div className={timer.running ? "pb-36" : "pb-16"}>
      {/* data-toasts-below: a new-record toast mustn't land on Finish. */}
      <header data-toasts-below className="sticky top-0 z-30 -mx-4 flex items-center justify-between gap-3 border-b border-line bg-chalk px-4 py-3">
        <div className="min-w-0">
          <h1 className="display truncate text-[22px]">{title}</h1>
          <p className="num text-[13px] text-steel">
            {t("train.elapsed", { time: elapsed, sets: t.plural("train.workingSets", workingSets) })}
          </p>
          {queued.length > 0 && (
            <p className="flex items-center gap-1 text-[13px] font-medium" role="status">
              <CloudOff className="size-3.5 shrink-0" aria-hidden /> {t.plural("train.waitingToSync", queued.length)}
            </p>
          )}
        </div>
        <Button
          variant={planDone ? "primary" : "secondary"}
          onClick={() => startTransition(async () => void ((await syncedForFinish()) && setFinishing(true)))}
          disabled={pending}
        >
          <Check className="size-4" /> {t("train.finish")}
        </Button>
      </header>

      <div className="divide-y divide-line">
      {blocks.map((block) => (
        <ExerciseBlock
          key={block.exercise.id}
          block={block}
          current={block.exercise.id === currentId}
          sets={shown.filter((s) => s.exerciseId === block.exercise.id)}
          units={units}
          onLog={(values) => log(block, values)}
          onSwap={() => setSwapping(block)}
          onRemove={() => removeExercise(block)}
          removing={pending}
          onDeletePending={(id) => pendingSets.remove(sessionId, [id])}
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
        <Plus className="size-5" /> {t("train.addExercise")}
      </Button>
      <Button variant="ghost" className="mt-2 w-full text-alert" onClick={discard} disabled={pending}>
        {t("train.discardWorkout")}
      </Button>

      {picking && <ExercisePicker exercises={library} onPick={addExercise} onClose={() => setPicking(false)} />}
      {swapping && (
        <ExercisePicker
          exercises={library.filter((e) => e.id !== swapping.exercise.id)}
          title={t("train.swapTitle", { exercise: exerciseName(t, { slug: swapping.exercise.slug ?? "", name: swapping.exercise.name }) })}
          initialMuscle={swapping.exercise.primaryMuscle}
          suggested={swapOptions(swapping.exercise, library, equipment, new Set(blocks.map((b) => b.exercise.id)))}
          onPick={(ex) => swapTo(swapping, ex)}
          onClose={() => setSwapping(null)}
        />
      )}

      {finishing && (
        <div role="dialog" aria-modal="true" aria-label={t("train.finishTitle").replace(/[?？]$/, "")} className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
          <Card className="w-full max-w-md space-y-3 rounded-b-none sm:rounded-card">
            <h2 className="display text-[22px]">{t("train.finishTitle")}</h2>
            <p className="text-sm text-steel">
              {t("train.finishSummary", {
                sets: t.plural("train.workingSets", workingSets),
                exercises: t.plural("train.exerciseCount", exerciseCount),
                time: elapsed,
              })}
            </p>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("train.feelPlaceholder")} maxLength={1000} />
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setFinishing(false)}>
                {t("train.keepGoing")}
              </Button>
              <Button className="flex-1" onClick={finish} disabled={pending}>
                {pending ? t("common.saving") : t("train.saveWorkout")}
              </Button>
            </div>
          </Card>
        </div>
      )}

      <RestTimerBar timer={timer} next={next} />
    </div>
  );
}

function ExerciseBlock({
  block,
  current,
  sets,
  units,
  onLog,
  onSwap,
  onRemove,
  removing,
  onDeletePending,
  onDeleted,
}: {
  block: Block;
  current: boolean;
  sets: ShownSet[];
  units: UnitSystem;
  onLog: (values: SetValues) => Promise<boolean>;
  onSwap: () => void;
  onRemove: () => void;
  removing: boolean;
  onDeletePending: (id: string) => void;
  onDeleted: (id: string) => void;
}) {
  const t = useT();
  const { exercise, target, last } = block;
  const name = exerciseName(t, { slug: exercise.slug ?? "", name: exercise.name });
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
      toast.error(t("train.enterWeightReps"));
      return;
    }
    startTransition(async () => {
      const ok = await onLog({
        weightKg: inputWeightToKg(w, units),
        reps: r,
        rpe: rpe ? Math.min(10, Math.max(1, Number(rpe))) : null,
        isWarmup: warmup,
      });
      if (!ok) return;
      setWarmup(false);
      setRpe("");
    });
  }

  function remove(set: ShownSet) {
    // A set still on the phone was never saved: just drop it.
    if (set.pending) return onDeletePending(set.id);
    startTransition(async () => {
      try {
        const res = await deleteSet(set.id);
        if (res.ok) onDeleted(set.id);
        else toast.error(res.error);
      } catch {
        toast.error(t("train.offline"));
      }
    });
  }

  const workingDone = sets.filter((s) => !s.isWarmup).length;
  const unit = weightUnit(units);
  const lastWorking = last?.sets.filter((s) => !s.isWarmup) ?? [];
  const nextIndex = warmup ? t("train.warmupMark") : String(workingDone + 1);
  // Set | weight | reps | RPE | action: shared by the header, logged rows and the entry row.
  const cols = "grid grid-cols-[2.25rem_1fr_1fr_3.75rem_2.75rem] items-center gap-2";

  return (
    <section className="space-y-3 py-6" data-testid="exercise-block">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="display text-[22px]">{name}</h2>
          {target && (
            <p className="num mt-0.5 text-[13px] text-steel">
              {t("train.targetLine", { sets: target.sets, min: target.repMin, max: target.repMax })}
              {target.targetRpe ? t("train.targetRpe", { rpe: target.targetRpe }) : ""}
              {t("train.targetRest", { min: Math.round((target.restSec / 60) * 10) / 10 })}
            </p>
          )}
          {target?.notes && <p className="mt-0.5 text-[13px] italic text-steel">{target.notes}</p>}
        </div>
        {target && (
          // Target sets as plates; one fills in per working set logged.
          <div role="img" aria-label={t("train.setsDone", { done: workingDone, total: target.sets })} className="flex shrink-0 gap-1 pt-1.5">
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
            {t("train.lastTime", { date: formatLocalDate(last.date, { weekday: undefined }, INTL_LOCALE[t.locale]) })}
            <span className="num text-iron">
              {lastWorking.length ? lastWorking.map((s) => `${displayWeight(s.weightKg, units)}×${s.reps}`).join(", ") : t("train.warmupsOnly")}
            </span>
          </p>
          {suggestion && (
            <p className="flex items-start gap-1.5">
              <TrendingUp className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                <span className="font-semibold">
                  {t("train.tryNext", { weight: formatWeight(suggestion.weightKg, units), reps: suggestion.reps })}
                </span>{" "}
                <span className="text-steel">
                  {suggestion.reason.kind === "addWeight"
                    ? t("train.reasonAddWeight", { reps: suggestion.reason.repMax, inc: suggestion.reason.incKg })
                    : t("train.reasonAddReps", { reps: suggestion.reason.target })}
                </span>
              </span>
            </p>
          )}
        </div>
      )}

      <div role="table" aria-label={t("train.setsTable", { exercise: name })} className="text-center">
        <div role="row" className={cn(cols, "border-b border-line pb-1.5 text-[12px] font-medium text-steel")}>
          <span role="columnheader">{t("train.set")}</span>
          <span role="columnheader">{unit}</span>
          <span role="columnheader">{t("train.reps")}</span>
          <span role="columnheader">{t("train.rpe")}</span>
          <span role="columnheader" className="sr-only">{t("train.actions")}</span>
        </div>
        {sets.map((s) => (
          <div role="row" key={s.id} className={cn(cols, "border-b border-line py-1.5")}>
            <span role="cell" className={cn("inline-flex items-center justify-center gap-0.5 text-sm font-semibold", s.isWarmup ? "text-steel" : "")}>
              {s.isWarmup ? t("train.warmupMark") : s.setIndex}
              {s.pending && (
                <>
                  <CloudOff className="size-3 text-steel" aria-hidden />
                  <span className="sr-only">{t("train.pendingSet")}</span>
                </>
              )}
            </span>
            <span role="cell" className="score text-[24px]">{displayWeight(s.weightKg, units)}</span>
            <span role="cell" className="score text-[24px]">{s.reps}</span>
            <span role="cell" className="num text-sm text-steel">{s.rpe ?? "–"}</span>
            <span role="cell">
              <button
                type="button"
                aria-label={t("train.deleteSet", { set: s.isWarmup ? t("train.warmupWord") : s.setIndex })}
                onClick={() => remove(s)}
                disabled={pending}
                className="mx-auto grid size-11 place-items-center rounded-full text-steel hover:bg-wash hover:text-alert"
              >
                <Trash2 className="size-4" />
              </button>
            </span>
          </div>
        ))}
        {/* The entry row is the next line of the log. */}
        <div role="row" id={`log-${exercise.id}`} className={cn(cols, "pt-2")}>
          <span role="cell" className="text-sm font-semibold text-steel">{nextIndex}</span>
          <span role="cell">
            <Input aria-label={unit} type="number" inputMode="decimal" step="any" min={0} value={weight} onChange={(e) => setWeight(e.target.value)} className="score h-12 px-1 text-center text-[24px]" />
          </span>
          <span role="cell">
            <Input aria-label={t("train.reps")} type="number" inputMode="numeric" min={1} value={reps} onChange={(e) => setReps(e.target.value)} className="score h-12 px-1 text-center text-[24px]" />
          </span>
          <span role="cell">
            <Input aria-label={t("train.rpe")} type="number" inputMode="decimal" min={1} max={10} step={0.5} value={rpe} onChange={(e) => setRpe(e.target.value)} placeholder="–" className="num h-12 px-1 text-center" />
          </span>
          <span role="cell">
            <Button
              variant={current ? "primary" : "secondary"}
              onClick={log}
              disabled={pending}
              className="h-12 w-full px-0"
              aria-label={t("train.logSetFor", { exercise: name })}
            >
              <Check className="size-5" />
            </Button>
          </span>
        </div>
      </div>
      {exercise.equipment === "barbell" && Number(weight) > 0 && <PlateLoad weight={Number(weight)} units={units} />}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <label className="flex w-fit items-center gap-2 text-[13px] text-steel">
          <input type="checkbox" checked={warmup} onChange={(e) => setWarmup(e.target.checked)} className="size-4 accent-[var(--iron)]" />
          {t("train.warmupCheckbox")}
        </label>
        <div className="ml-auto flex">
          {/* Swap only before the first set: after that, the sets belong to this exercise. */}
          {sets.length === 0 && (
            <Button variant="ghost" size="sm" onClick={onSwap} disabled={removing}>
              {t("train.swap")}
              <span className="sr-only"> {name}</span>
            </Button>
          )}
          {/* Words, not a bin icon: the bins in the rows above delete single sets. */}
          <Button variant="ghost" size="sm" edge="end" onClick={onRemove} disabled={removing} className="hover:text-alert">
            {t("train.removeExercise")}
            <span className="sr-only"> {name}</span>
          </Button>
        </div>
      </div>
    </section>
  );
}

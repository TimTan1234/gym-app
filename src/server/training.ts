"use server";

import { z } from "zod";
import { refresh } from "next/cache";
import { db } from "@/lib/db";
import { requireProfile } from "@/lib/session";
import { todayLocal } from "@/lib/dates";
import { lastSessionSets } from "@/lib/queries";
import { READINESS, type Readiness } from "@/lib/training/readiness";
import { detectRecords, type Bests, type NewRecord, type RecordType } from "@/lib/training/records";
import { getT } from "@/i18n/server";
import type { ActionResult } from "./profile";

export async function startWorkout(planDayId?: string, readiness?: Readiness): Promise<ActionResult & { sessionId?: string }> {
  const { user, profile } = await requireProfile();
  const feel = z.enum(READINESS).optional().safeParse(readiness);

  const active = await db.workoutSession.findFirst({ where: { userId: user.id, endedAt: null } });
  if (active) return { ok: true, sessionId: active.id };

  if (planDayId) {
    const day = await db.planDay.findFirst({ where: { id: planDayId, plan: { userId: user.id } } });
    if (!day) return { ok: false, error: (await getT())("train.errors.planDayNotFound") };
  }
  const now = new Date();
  const session = await db.workoutSession.create({
    data: {
      userId: user.id,
      startedAt: now,
      localDate: todayLocal(profile.timezone, now),
      planDayId: planDayId ?? null,
      readiness: planDayId && feel.success ? (feel.data ?? null) : null,
    },
  });
  return { ok: true, sessionId: session.id };
}

const SetSchema = z.object({
  /** Made on the phone, so a set re-sent after a lost reply (or from the offline queue) is saved once. */
  id: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
  /** When it was logged on the phone; a set sent later from the offline queue keeps its real time. */
  completedAt: z.iso.datetime().optional(),
  sessionId: z.string().min(1),
  exerciseId: z.string().min(1),
  weightKg: z.number().min(0).max(1000),
  reps: z.number().int().min(0).max(1000),
  rpe: z.number().min(1).max(10).nullable(),
  isWarmup: z.boolean(),
});

export type SetInput = z.infer<typeof SetSchema>;

export interface LoggedSet {
  id: string;
  exerciseId: string;
  setIndex: number;
  weightKg: number;
  reps: number;
  rpe: number | null;
  isWarmup: boolean;
}

async function currentBests(userId: string, exerciseId: string): Promise<Bests> {
  const rows = await db.personalRecord.groupBy({
    by: ["type"],
    where: { userId, exerciseId },
    _max: { value: true },
  });
  const bests: Bests = {};
  for (const r of rows) if (r._max.value !== null) bests[r.type as RecordType] = r._max.value;
  return bests;
}

export async function logSet(
  input: z.infer<typeof SetSchema>,
): Promise<{ ok: true; set: LoggedSet; records: NewRecord[] } | { ok: false; error: string }> {
  const { user } = await requireProfile();
  const parsed = SetSchema.safeParse(input);
  const t = await getT();
  if (!parsed.success) return { ok: false, error: t("train.errors.invalidSet") };
  const { id, completedAt, ...s } = parsed.data;

  const [session, exercise] = await Promise.all([
    db.workoutSession.findFirst({ where: { id: s.sessionId, userId: user.id }, select: { id: true, startedAt: true, skippedExerciseIds: true } }),
    db.exercise.findFirst({ where: { id: s.exerciseId, OR: [{ userId: null }, { userId: user.id }] }, select: { id: true } }),
  ]);
  if (!session) return { ok: false, error: t("train.errors.workoutNotFound") };
  if (!exercise) return { ok: false, error: t("train.errors.exerciseNotFound") };

  // Already saved (the reply was lost, or the queue sent it twice): return it as it is.
  const saved = () => db.workoutSet.findFirst({ where: { id, sessionId: s.sessionId } });
  const existing = await saved();
  if (existing) return { ok: true, set: toLogged(existing), records: [] };
  // A queued set keeps the time it was logged, within the workout and not in the future.
  const at = completedAt ? new Date(Math.min(Date.now(), Math.max(session.startedAt.getTime(), Date.parse(completedAt)))) : new Date();

  const bests = await currentBests(user.id, s.exerciseId);
  const records = detectRecords(s, bests);

  const create = () => db.$transaction(async (tx) => {
    const count = await tx.workoutSet.count({ where: { sessionId: s.sessionId, exerciseId: s.exerciseId } });
    const created = await tx.workoutSet.create({
      data: { ...s, id, completedAt: at, setIndex: count + 1 },
    });
    // Logging an exercise that was taken out of this workout puts it back in.
    if (session.skippedExerciseIds.includes(s.exerciseId)) {
      await tx.workoutSession.update({
        where: { id: s.sessionId },
        data: { skippedExerciseIds: session.skippedExerciseIds.filter((id) => id !== s.exerciseId) },
      });
    }
    if (records.length) {
      await tx.personalRecord.createMany({
        data: records.map((r) => ({
          userId: user.id,
          exerciseId: s.exerciseId,
          type: r.type,
          value: r.value,
          setId: created.id,
          achievedAt: created.completedAt,
        })),
      });
    }
    return created;
  });
  let set;
  try {
    set = await create();
  } catch (e) {
    // Two copies of the same set arrived together: the other one won, which is the same set.
    const other = await saved();
    if (other) return { ok: true, set: toLogged(other), records: [] };
    throw e;
  }

  // First-ever sets set a baseline rather than a "PR" worth celebrating.
  const celebrate = Object.keys(bests).length > 0 ? records : [];
  return {
    ok: true,
    set: toLogged(set),
    records: celebrate,
  };
}

function toLogged(set: LoggedSet): LoggedSet {
  return { id: set.id, exerciseId: set.exerciseId, setIndex: set.setIndex, weightKg: set.weightKg, reps: set.reps, rpe: set.rpe, isWarmup: set.isWarmup };
}

type Swaps = Record<string, string>;
const swapsOf = (v: unknown): Swaps => (v && typeof v === "object" && !Array.isArray(v) ? (v as Swaps) : {});
/** The planned exercise whose slot `exerciseId` fills: the one it was swapped in for, or itself. */
const plannedSlot = (swaps: Swaps, exerciseId: string) => Object.keys(swaps).find((k) => swaps[k] === exerciseId) ?? exerciseId;

/**
 * Does another exercise in place of one in a workout in progress, before any of its sets are logged.
 * A planned exercise's slot remembers the swap, so the new one keeps the plan's target and position
 * when the workout is reopened. Swapping back to the planned exercise clears it.
 */
export async function swapWorkoutExercise(sessionId: string, fromId: string, toId: string): Promise<ActionResult> {
  const { user } = await requireProfile();
  const t = await getT();
  const [session, to, logged] = await Promise.all([
    db.workoutSession.findFirst({
      where: { id: sessionId, userId: user.id, endedAt: null },
      select: { exerciseSwaps: true, planDay: { select: { exercises: { select: { exerciseId: true } } } } },
    }),
    db.exercise.findFirst({ where: { id: toId, OR: [{ userId: null }, { userId: user.id }] }, select: { id: true } }),
    db.workoutSet.count({ where: { sessionId, exerciseId: fromId } }),
  ]);
  if (!session) return { ok: false, error: t("train.errors.workoutNotFound") };
  if (!to) return { ok: false, error: t("train.errors.exerciseNotFound") };
  if (logged > 0) return { ok: false, error: t("train.errors.swapAfterSets") };
  const swaps = swapsOf(session.exerciseSwaps);
  const slot = plannedSlot(swaps, fromId);
  // Not a planned exercise: it lives only on the phone until a set is logged, so there's nothing to keep.
  if (!session.planDay?.exercises.some((e) => e.exerciseId === slot)) return { ok: true };
  const { [slot]: _old, ...rest } = swaps;
  await db.workoutSession.update({
    where: { id: sessionId },
    data: { exerciseSwaps: toId === slot ? rest : { ...rest, [slot]: toId } },
  });
  return { ok: true };
}

export async function deleteSet(setId: string): Promise<ActionResult> {
  const { user } = await requireProfile();
  const set = await db.workoutSet.findFirst({ where: { id: setId, session: { userId: user.id } } });
  if (!set) return { ok: false, error: (await getT())("train.errors.setNotFound") };
  await db.$transaction([
    db.workoutSet.delete({ where: { id: setId } }),
    // Re-number remaining sets for this exercise in this session.
    db.workoutSet.updateMany({
      where: { sessionId: set.sessionId, exerciseId: set.exerciseId, setIndex: { gt: set.setIndex } },
      data: { setIndex: { decrement: 1 } },
    }),
  ]);
  return { ok: true };
}

/**
 * Takes an exercise out of a workout in progress: its sets go (with any records they set), and a
 * planned exercise is remembered as skipped so reopening the workout doesn't bring it back.
 */
export async function removeWorkoutExercise(sessionId: string, exerciseId: string): Promise<ActionResult> {
  const { user } = await requireProfile();
  const session = await db.workoutSession.findFirst({
    where: { id: sessionId, userId: user.id, endedAt: null },
    select: { skippedExerciseIds: true, exerciseSwaps: true },
  });
  if (!session) return { ok: false, error: (await getT())("train.errors.workoutNotFound") };
  // A swapped-in exercise gives up its planned slot: skip the planned one and forget the swap.
  const swaps = swapsOf(session.exerciseSwaps);
  const slot = plannedSlot(swaps, exerciseId);
  const { [slot]: _gone, ...rest } = swaps;
  await db.$transaction([
    db.workoutSet.deleteMany({ where: { sessionId, exerciseId } }),
    db.workoutSession.update({
      where: { id: sessionId },
      data: { skippedExerciseIds: [...new Set([...session.skippedExerciseIds, slot])], exerciseSwaps: rest },
    }),
  ]);
  return { ok: true };
}

export async function finishWorkout(sessionId: string, notes: string): Promise<ActionResult & { discarded?: boolean }> {
  const { user } = await requireProfile();
  const session = await db.workoutSession.findFirst({
    where: { id: sessionId, userId: user.id },
    include: { _count: { select: { sets: true } } },
  });
  if (!session) return { ok: false, error: (await getT())("train.errors.workoutNotFound") };
  if (session._count.sets === 0) {
    await db.workoutSession.delete({ where: { id: sessionId } });
    refresh();
    return { ok: true, discarded: true };
  }
  await db.workoutSession.update({
    where: { id: sessionId },
    data: { endedAt: session.endedAt ?? new Date(), notes: notes.slice(0, 1000) || null },
  });
  refresh();
  return { ok: true };
}

export async function discardWorkout(sessionId: string): Promise<ActionResult> {
  const { user } = await requireProfile();
  await db.workoutSession.deleteMany({ where: { id: sessionId, userId: user.id } });
  refresh();
  return { ok: true };
}

const CustomExerciseSchema = z.object({
  name: z.string().trim().min(2).max(60),
  primaryMuscle: z.string().min(1).max(30),
  equipment: z.string().min(1).max(30),
  category: z.enum(["COMPOUND", "ISOLATION", "CARDIO"]),
  isLowerBody: z.boolean(),
});

export async function createCustomExercise(
  input: z.infer<typeof CustomExerciseSchema>,
): Promise<ActionResult & { exerciseId?: string }> {
  const { user } = await requireProfile();
  const parsed = CustomExerciseSchema.safeParse(input);
  const t = await getT();
  if (!parsed.success) return { ok: false, error: t("train.errors.invalidExercise") };
  const slug = `custom-${parsed.data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
  const exists = await db.exercise.findFirst({ where: { userId: user.id, slug } });
  if (exists) return { ok: false, error: t("train.errors.duplicateExercise") };
  const ex = await db.exercise.create({
    data: { ...parsed.data, slug, secondaryMuscles: [], userId: user.id },
  });
  refresh();
  return { ok: true, exerciseId: ex.id };
}

export async function deleteCustomExercise(id: string): Promise<ActionResult> {
  const { user } = await requireProfile();
  const used = await db.workoutSet.count({ where: { exerciseId: id } });
  const inPlans = await db.planExercise.count({ where: { exerciseId: id } });
  if (used || inPlans) return { ok: false, error: (await getT())("train.errors.exerciseInUse") };
  await db.exercise.deleteMany({ where: { id, userId: user.id } });
  refresh();
  return { ok: true };
}

export async function getLastSets(exerciseId: string, excludeSessionId: string) {
  const { user } = await requireProfile();
  const map = await lastSessionSets(user.id, [exerciseId], excludeSessionId);
  return map.get(exerciseId) ?? null;
}

"use server";

import { z } from "zod";
import { refresh } from "next/cache";
import { db } from "@/lib/db";
import { requireProfile } from "@/lib/session";
import { todayLocal } from "@/lib/dates";
import { lastSessionSets } from "@/lib/queries";
import { detectRecords, type Bests, type NewRecord, type RecordType } from "@/lib/training/records";
import type { ActionResult } from "./profile";

export async function startWorkout(planDayId?: string): Promise<ActionResult & { sessionId?: string }> {
  const { user, profile } = await requireProfile();

  const active = await db.workoutSession.findFirst({ where: { userId: user.id, endedAt: null } });
  if (active) return { ok: true, sessionId: active.id };

  if (planDayId) {
    const day = await db.planDay.findFirst({ where: { id: planDayId, plan: { userId: user.id } } });
    if (!day) return { ok: false, error: "Plan day not found" };
  }
  const now = new Date();
  const session = await db.workoutSession.create({
    data: { userId: user.id, startedAt: now, localDate: todayLocal(profile.timezone, now), planDayId: planDayId ?? null },
  });
  return { ok: true, sessionId: session.id };
}

const SetSchema = z.object({
  sessionId: z.string().min(1),
  exerciseId: z.string().min(1),
  weightKg: z.number().min(0).max(1000),
  reps: z.number().int().min(0).max(1000),
  rpe: z.number().min(1).max(10).nullable(),
  isWarmup: z.boolean(),
});

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
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid set" };
  const s = parsed.data;

  const [session, exercise] = await Promise.all([
    db.workoutSession.findFirst({ where: { id: s.sessionId, userId: user.id }, select: { id: true } }),
    db.exercise.findFirst({ where: { id: s.exerciseId, OR: [{ userId: null }, { userId: user.id }] }, select: { id: true } }),
  ]);
  if (!session) return { ok: false, error: "Workout not found" };
  if (!exercise) return { ok: false, error: "Exercise not found" };

  const bests = await currentBests(user.id, s.exerciseId);
  const records = detectRecords(s, bests);

  const set = await db.$transaction(async (tx) => {
    const count = await tx.workoutSet.count({ where: { sessionId: s.sessionId, exerciseId: s.exerciseId } });
    const created = await tx.workoutSet.create({
      data: { ...s, setIndex: count + 1 },
    });
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

  // First-ever sets set a baseline rather than a "PR" worth celebrating.
  const celebrate = Object.keys(bests).length > 0 ? records : [];
  return {
    ok: true,
    set: { id: set.id, exerciseId: set.exerciseId, setIndex: set.setIndex, weightKg: set.weightKg, reps: set.reps, rpe: set.rpe, isWarmup: set.isWarmup },
    records: celebrate,
  };
}

export async function deleteSet(setId: string): Promise<ActionResult> {
  const { user } = await requireProfile();
  const set = await db.workoutSet.findFirst({ where: { id: setId, session: { userId: user.id } } });
  if (!set) return { ok: false, error: "Set not found" };
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

export async function finishWorkout(sessionId: string, notes: string): Promise<ActionResult & { discarded?: boolean }> {
  const { user } = await requireProfile();
  const session = await db.workoutSession.findFirst({
    where: { id: sessionId, userId: user.id },
    include: { _count: { select: { sets: true } } },
  });
  if (!session) return { ok: false, error: "Workout not found" };
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
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid exercise" };
  const slug = `custom-${parsed.data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
  const exists = await db.exercise.findFirst({ where: { userId: user.id, slug } });
  if (exists) return { ok: false, error: "You already have an exercise with that name" };
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
  if (used || inPlans) return { ok: false, error: "This exercise is used in workouts or plans and can't be deleted" };
  await db.exercise.deleteMany({ where: { id, userId: user.id } });
  refresh();
  return { ok: true };
}

export async function getLastSets(exerciseId: string, excludeSessionId: string) {
  const { user } = await requireProfile();
  const map = await lastSessionSets(user.id, [exerciseId], excludeSessionId);
  return map.get(exerciseId) ?? null;
}

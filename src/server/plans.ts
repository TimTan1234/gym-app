"use server";

import { refresh } from "next/cache";
import { db } from "@/lib/db";
import { requireProfile } from "@/lib/session";
import { PlanInputSchema, type PlanInput } from "@/lib/plan-input";
import { getT } from "@/i18n/server";
import type { ActionResult } from "./profile";

async function validate(userId: string, input: PlanInput) {
  const t = await getT();
  const parsed = PlanInputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const emptyDay = issue?.code === "too_small" && issue.path.at(-1) === "exercises";
    return { error: t(emptyDay ? "plans.errors.dayNeedsExercise" : "plans.errors.invalid") } as const;
  }
  const ids = [...new Set(parsed.data.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)))];
  const owned = await db.exercise.count({ where: { id: { in: ids }, OR: [{ userId: null }, { userId }] } });
  if (owned !== ids.length) return { error: t("plans.errors.unknownExercises") } as const;
  // Normalise inverted rep ranges.
  for (const d of parsed.data.days)
    for (const e of d.exercises) if (e.repMin > e.repMax) [e.repMin, e.repMax] = [e.repMax, e.repMin];
  return { plan: parsed.data } as const;
}

const exerciseRows = (exercises: PlanInput["days"][number]["exercises"]) =>
  exercises.map((e, order) => ({ ...e, order }));

export async function createPlan(input: PlanInput, activate: boolean): Promise<ActionResult & { planId?: string }> {
  const { user } = await requireProfile();
  const v = await validate(user.id, input);
  if ("error" in v) return { ok: false, error: v.error! };
  const p = v.plan;

  const plan = await db.$transaction(async (tx) => {
    if (activate) await tx.trainingPlan.updateMany({ where: { userId: user.id }, data: { isActive: false } });
    return tx.trainingPlan.create({
      data: {
        userId: user.id,
        name: p.name,
        goal: p.goal,
        weeks: p.weeks,
        notes: p.notes,
        source: p.source,
        daysPerWeek: p.days.length,
        isActive: activate,
        days: {
          create: p.days.map((d, dayIndex) => ({
            dayIndex,
            name: d.name,
            exercises: { create: exerciseRows(d.exercises) },
          })),
        },
      },
    });
  });
  refresh();
  return { ok: true, planId: plan.id };
}

/**
 * Update a plan in place. Days are matched by position so existing PlanDay
 * ids (referenced by workout history) are preserved.
 */
export async function updatePlan(planId: string, input: PlanInput): Promise<ActionResult> {
  const { user } = await requireProfile();
  const existing = await db.trainingPlan.findFirst({ where: { id: planId, userId: user.id }, include: { days: true } });
  if (!existing) return { ok: false, error: (await getT())("plans.errors.notFound") };
  const v = await validate(user.id, input);
  if ("error" in v) return { ok: false, error: v.error! };
  const p = v.plan;

  await db.$transaction(async (tx) => {
    await tx.trainingPlan.update({
      where: { id: planId },
      data: { name: p.name, goal: p.goal, weeks: p.weeks, notes: p.notes, daysPerWeek: p.days.length },
    });
    await tx.planDay.deleteMany({ where: { planId, dayIndex: { gte: p.days.length } } });
    for (const [dayIndex, d] of p.days.entries()) {
      const day = await tx.planDay.upsert({
        where: { planId_dayIndex: { planId, dayIndex } },
        create: { planId, dayIndex, name: d.name },
        update: { name: d.name },
      });
      await tx.planExercise.deleteMany({ where: { planDayId: day.id } });
      await tx.planExercise.createMany({ data: exerciseRows(d.exercises).map((e) => ({ ...e, planDayId: day.id })) });
    }
  });
  refresh();
  return { ok: true };
}

export async function setActivePlan(planId: string): Promise<ActionResult> {
  const { user } = await requireProfile();
  const plan = await db.trainingPlan.findFirst({ where: { id: planId, userId: user.id } });
  if (!plan) return { ok: false, error: (await getT())("plans.errors.notFound") };
  await db.$transaction([
    db.trainingPlan.updateMany({ where: { userId: user.id }, data: { isActive: false } }),
    db.trainingPlan.update({ where: { id: planId }, data: { isActive: true } }),
  ]);
  refresh();
  return { ok: true };
}

export async function deactivatePlan(planId: string): Promise<ActionResult> {
  const { user } = await requireProfile();
  await db.trainingPlan.updateMany({ where: { id: planId, userId: user.id }, data: { isActive: false } });
  refresh();
  return { ok: true };
}

export async function deletePlan(planId: string): Promise<ActionResult> {
  const { user } = await requireProfile();
  await db.trainingPlan.deleteMany({ where: { id: planId, userId: user.id } });
  refresh();
  return { ok: true };
}

"use server";

import { refresh } from "next/cache";
import { db } from "@/lib/db";
import { requireProfile } from "@/lib/session";
import type { Proposal } from "@/lib/ai/coach";
import { createPlan, updatePlan } from "./plans";
import { deleteMeal, saveMeal, updateMeal } from "./nutrition";
import type { ResolvedPlanDraft } from "@/lib/ai/plan";
import { mealUnchanged, planEditStillValid, planShapeOf } from "@/lib/ai/coach-edits";
import { setTargets, type ActionResult } from "./profile";
import { getT } from "@/i18n/server";

/**
 * Apply a coach proposal. The proposal is read from the stored message, not
 * from the client, so the user can only confirm exactly what the coach proposed.
 */
export async function applyProposal(messageId: string, index: number): Promise<ActionResult> {
  const { user } = await requireProfile();
  const message = await db.chatMessage.findFirst({ where: { id: messageId, thread: { userId: user.id } } });
  const proposals = (message?.proposals ?? []) as Proposal[];
  const proposal = proposals[index];
  if (!message || !proposal) return { ok: false, error: (await getT())("coach.errors.proposalNotFound") };
  if (proposal.applied) return { ok: false, error: (await getT())("coach.errors.alreadyApplied") };

  const result = await apply(proposal);
  if (!result.ok) return result;

  proposals[index] = { ...proposal, applied: true };
  await db.chatMessage.update({ where: { id: messageId }, data: { proposals: proposals as object[] } });
  refresh();
  return { ok: true };
}

const planInput = (p: ResolvedPlanDraft) =>
  p.days.map((d) => ({
    name: d.name,
    exercises: d.exercises.map((e) => ({
      exerciseId: e.exerciseId,
      sets: e.sets,
      repMin: e.repMin,
      repMax: e.repMax,
      targetRpe: e.targetRpe,
      restSec: e.restSec,
      notes: e.notes,
    })),
  }));

/** Each proposal kind goes through the same server action the app's own screens use. */
async function apply(proposal: Proposal): Promise<ActionResult> {
  switch (proposal.kind) {
    case "targets":
      return setTargets({
        manual: true,
        targetKcal: proposal.targetKcal,
        targetProteinG: proposal.targetProteinG,
        targetCarbsG: proposal.targetCarbsG,
        targetFatG: proposal.targetFatG,
      });
    case "plan": {
      const p = proposal.plan;
      return createPlan({ name: p.name, goal: "COACH", weeks: p.weeks, notes: p.notes, source: "AI", days: planInput(p) }, true);
    }
    case "planEdit": {
      const { user } = await requireProfile();
      const existing = await db.trainingPlan.findFirst({
        where: { id: proposal.planId, userId: user.id },
        include: { days: { orderBy: { dayIndex: "asc" }, include: { exercises: { orderBy: { order: "asc" }, include: { exercise: { select: { slug: true, name: true } } } } } } },
      });
      if (!existing) return { ok: false, error: (await getT())("plans.errors.notFound") };
      if (!planEditStillValid(planShapeOf(existing.days), proposal.plan, proposal.changes)) {
        return { ok: false, error: (await getT())("coach.errors.staleProposal") };
      }
      // Keep the plan's own name, goal and source; the coach only edits the days.
      return updatePlan(existing.id, {
        name: existing.name,
        goal: existing.goal,
        weeks: proposal.plan.weeks,
        notes: proposal.plan.notes ?? existing.notes,
        source: existing.source,
        days: planInput(proposal.plan),
      });
    }
    case "mealLog": {
      const m = proposal.meal;
      return saveMeal({ mealType: m.mealType, description: m.description, source: "AI_TEXT", notes: null, eatenAt: new Date().toISOString(), localDate: m.localDate, items: m.items });
    }
    case "mealUpdate": {
      const { user } = await requireProfile();
      const current = await db.meal.findFirst({ where: { id: proposal.mealId, userId: user.id }, include: { items: true } });
      if (!current) return { ok: false, error: (await getT())("nutrition.mealNotFound") };
      if (!mealUnchanged(proposal.before, current)) return { ok: false, error: (await getT())("coach.errors.staleProposal") };
      return updateMeal(proposal.mealId, { mealType: proposal.meal.mealType, description: proposal.meal.description, items: proposal.meal.items });
    }
    case "mealDelete":
      return deleteMeal(proposal.mealId);
    default: {
      const unknown: never = proposal;
      return { ok: false, error: `Unknown proposal ${(unknown as { kind: string }).kind}` };
    }
  }
}

export async function deleteThread(threadId: string): Promise<ActionResult> {
  const { user } = await requireProfile();
  await db.chatThread.deleteMany({ where: { id: threadId, userId: user.id } });
  refresh();
  return { ok: true };
}

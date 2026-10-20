"use server";

import { refresh } from "next/cache";
import { db } from "@/lib/db";
import { requireProfile } from "@/lib/session";
import type { Proposal } from "@/lib/ai/coach";
import { createPlan } from "./plans";
import { setTargets, type ActionResult } from "./profile";

/**
 * Apply a coach proposal. The proposal is read from the stored message, not
 * from the client, so the user can only confirm exactly what the coach proposed.
 */
export async function applyProposal(messageId: string, index: number): Promise<ActionResult> {
  const { user } = await requireProfile();
  const message = await db.chatMessage.findFirst({ where: { id: messageId, thread: { userId: user.id } } });
  const proposals = (message?.proposals ?? []) as Proposal[];
  const proposal = proposals[index];
  if (!message || !proposal) return { ok: false, error: "Proposal not found" };
  if (proposal.applied) return { ok: false, error: "Already applied" };

  let result: ActionResult;
  if (proposal.kind === "targets") {
    result = await setTargets({
      manual: true,
      targetKcal: proposal.targetKcal,
      targetProteinG: proposal.targetProteinG,
      targetCarbsG: proposal.targetCarbsG,
      targetFatG: proposal.targetFatG,
    });
  } else {
    const p = proposal.plan;
    result = await createPlan(
      {
        name: p.name,
        goal: "COACH",
        weeks: p.weeks,
        notes: p.notes,
        source: "AI",
        days: p.days.map((d) => ({
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
        })),
      },
      true,
    );
  }
  if (!result.ok) return result;

  proposals[index] = { ...proposal, applied: true };
  await db.chatMessage.update({ where: { id: messageId }, data: { proposals: proposals as object[] } });
  refresh();
  return { ok: true };
}

export async function deleteThread(threadId: string): Promise<ActionResult> {
  const { user } = await requireProfile();
  await db.chatThread.deleteMany({ where: { id: threadId, userId: user.id } });
  refresh();
  return { ok: true };
}

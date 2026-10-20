import "server-only";
import { zodTextFormat } from "openai/helpers/zod";
import { isAiMock, models, openai, reasoningOptions } from "./client";
import { PLAN_SYSTEM_PROMPT, languageInstruction } from "./prompts";
import type { Locale } from "@/i18n/config";
import { planDraftSchema, type PlanDraft, type PlanRequest } from "./schemas";
import mockPlan from "./fixtures/plan.json";

export interface LibraryExercise {
  id: string;
  slug: string;
  name: string;
  primaryMuscle: string;
  equipment: string;
}

export interface ResolvedPlanDraft extends Omit<PlanDraft, "days"> {
  days: {
    name: string;
    exercises: (PlanDraft["days"][number]["exercises"][number] & { exerciseId: string; exerciseName: string })[];
  }[];
}

/** The user's equipment matches too few library exercises to build a plan. */
export class NotEnoughExercisesError extends Error {
  constructor() {
    super("Not enough exercises match your equipment. Add more equipment.");
  }
}

/** Working sets that fit a session (~2.5 min per set including rest). */
export function maxWorkingSets(sessionMinutes: number): number {
  return Math.max(6, Math.round(sessionMinutes / 2.5));
}

/** Exercises usable with the given equipment (bodyweight always allowed). */
export function filterByEquipment<T extends { equipment: string }>(exercises: T[], equipment: string[]): T[] {
  const allowed = new Set([...equipment, "bodyweight"]);
  return exercises.filter((e) => allowed.has(e.equipment));
}

export async function generatePlan(req: PlanRequest, library: LibraryExercise[], locale: Locale = "en"): Promise<ResolvedPlanDraft> {
  const available = filterByEquipment(library, req.equipment);
  if (available.length < 5) throw new NotEnoughExercisesError();
  const slugs = available.map((e) => e.slug) as [string, ...string[]];
  const schema = planDraftSchema(slugs);

  let draft: PlanDraft;
  if (isAiMock()) {
    // The fixture may use equipment the user lacks; validate against the full library.
    const all = library.map((e) => e.slug) as [string, ...string[]];
    return resolvePlanDraft(planDraftSchema(all).parse(mockPlan), library);
  } else {
    const catalog = available.map((e) => `${e.slug} (${e.name}; ${e.primaryMuscle}; ${e.equipment})`).join("\n");
    const request = [
      `Goal: ${req.goal}`,
      `Training days per week: ${req.daysPerWeek}`,
      `Session length: ${req.sessionMinutes} minutes (budget: at most ${maxWorkingSets(req.sessionMinutes)} working sets per session in total)`,
      `Experience: ${req.experience}`,
      `Equipment: ${req.equipment.join(", ")}`,
      `Focus muscles: ${req.focusMuscles.join(", ") || "balanced"}`,
      `Injuries / limitations: ${req.limitations || "none"}`,
      "",
      "Allowed exercises:",
      catalog,
    ].join("\n");

    const response = await openai().responses.parse({
      model: models.plan(),
      ...reasoningOptions(),
      instructions: PLAN_SYSTEM_PROMPT + languageInstruction(locale),
      input: request,
      text: { format: zodTextFormat(schema, "training_plan") },
    });
    if (!response.output_parsed) throw new Error("The AI did not return a plan. Please try again.");
    draft = schema.parse(response.output_parsed);
  }

  return resolvePlanDraft(draft, available);
}

/**
 * Map slugs → exercise ids and fix rep ranges. Throws on unknown slugs so
 * an AI-invented exercise can never reach the database.
 */
export function resolvePlanDraft(draft: PlanDraft, library: Pick<LibraryExercise, "id" | "slug" | "name">[]): ResolvedPlanDraft {
  const bySlug = new Map(library.map((e) => [e.slug, e]));
  return {
    ...draft,
    days: draft.days.map((day) => ({
      name: day.name,
      exercises: day.exercises.map((ex) => {
        const lib = bySlug.get(ex.exerciseSlug);
        if (!lib) throw new Error(`Unknown exercise in plan: ${ex.exerciseSlug}`);
        const [repMin, repMax] = ex.repMin <= ex.repMax ? [ex.repMin, ex.repMax] : [ex.repMax, ex.repMin];
        return { ...ex, repMin, repMax, exerciseId: lib.id, exerciseName: lib.name };
      }),
    })),
  };
}

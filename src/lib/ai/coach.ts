import "server-only";
import { z } from "zod";
import { zodResponsesFunction } from "openai/helpers/zod";
import type { ResponseInputItem } from "openai/resources/responses/responses";
import { db } from "@/lib/db";
import { addDays, todayLocal } from "@/lib/dates";
import { KCAL_FLOOR } from "@/lib/nutrition/targets";
import { sumNutrients } from "@/lib/nutrition/totals";
import { best1RM } from "@/lib/training/summary";
import { isAiMock, models, openai, reasoningOptions } from "./client";
import { coachSystemPrompt } from "./prompts";
import { planDraftSchema } from "./schemas";
import { resolvePlanDraft, type ResolvedPlanDraft } from "./plan";

// ---------- Proposals (shown as confirm cards; never applied by the model) ----------

export type Proposal =
  | {
      kind: "targets";
      targetKcal: number;
      targetProteinG: number;
      targetCarbsG: number;
      targetFatG: number;
      reason: string;
      applied?: boolean;
    }
  | { kind: "plan"; plan: ResolvedPlanDraft; reason: string; applied?: boolean };

export interface CoachContext {
  userId: string;
  userName: string;
  timezone: string;
  sex: "MALE" | "FEMALE";
}

// ---------- Tool schemas ----------

const Days = z.object({ days: z.number().int().min(1).max(30).describe("How many days back, including today") });
const Count = z.object({ count: z.number().int().min(1).max(10) });
const Empty = z.object({});
const ExerciseQuery = z.object({ exerciseName: z.string().describe("Exercise name, e.g. 'bench press'") });
const TargetProposal = z.object({
  targetKcal: z.number().int(),
  targetProteinG: z.number().int(),
  targetCarbsG: z.number().int(),
  targetFatG: z.number().int(),
  reason: z.string().describe("One or two sentences explaining the change"),
});

async function buildTools(ctx: CoachContext) {
  const library = await db.exercise.findMany({
    where: { OR: [{ userId: null }, { userId: ctx.userId }], category: { not: "CARDIO" } },
    select: { id: true, slug: true, name: true },
  });
  const planSchema = planDraftSchema(library.map((e) => e.slug) as [string, ...string[]]);
  const PlanProposal = z.object({ plan: planSchema, reason: z.string() });

  const tools = [
    zodResponsesFunction({ name: "get_targets", parameters: Empty, description: "User's daily calorie/macro targets, goal, profile and latest body weight." }),
    zodResponsesFunction({ name: "get_nutrition_summary", parameters: Days, description: "Daily nutrition totals for recent days, plus today's meals." }),
    zodResponsesFunction({ name: "get_recent_workouts", parameters: Count, description: "Most recent finished workouts with exercises and sets." }),
    zodResponsesFunction({ name: "get_active_plan", parameters: Empty, description: "The user's active training plan." }),
    zodResponsesFunction({ name: "get_body_metrics", parameters: Days, description: "Body weight / body fat / waist entries." }),
    zodResponsesFunction({ name: "get_exercise_history", parameters: ExerciseQuery, description: "Recent sessions and estimated 1RM for one exercise." }),
    zodResponsesFunction({
      name: "propose_target_change",
      parameters: TargetProposal,
      description: "Propose new daily calorie/macro targets. The user must confirm before anything changes.",
    }),
    zodResponsesFunction({
      name: "propose_plan",
      parameters: PlanProposal,
      description: "Propose a new or modified training plan (full plan). The user must confirm; it is saved as their active plan.",
    }),
  ];

  async function execute(name: string, rawArgs: string, proposals: Proposal[]): Promise<unknown> {
    const args = rawArgs ? JSON.parse(rawArgs) : {};
    const today = todayLocal(ctx.timezone);
    switch (name) {
      case "get_targets": {
        const [profile, weight] = await Promise.all([
          db.profile.findUnique({ where: { userId: ctx.userId } }),
          db.bodyMetric.findFirst({ where: { userId: ctx.userId }, orderBy: { localDate: "desc" } }),
        ]);
        if (!profile) return { error: "No profile" };
        return {
          goal: profile.goal,
          rateKgPerWeek: profile.rateKgPerWeek,
          activityLevel: profile.activityLevel,
          experience: profile.experience,
          equipment: profile.equipment,
          sex: profile.sex,
          heightCm: profile.heightCm,
          latestWeightKg: weight?.weightKg ?? null,
          targets: { kcal: profile.targetKcal, proteinG: profile.targetProteinG, carbsG: profile.targetCarbsG, fatG: profile.targetFatG },
          unitSystem: profile.unitSystem,
        };
      }
      case "get_nutrition_summary": {
        const { days } = Days.parse(args);
        const meals = await db.meal.findMany({
          where: { userId: ctx.userId, localDate: { gte: addDays(today, -(days - 1)) } },
          include: { items: { select: { name: true, grams: true, kcal: true, proteinG: true } } },
          orderBy: { eatenAt: "asc" },
        });
        const byDay = new Map<string, typeof meals>();
        for (const m of meals) byDay.set(m.localDate, [...(byDay.get(m.localDate) ?? []), m]);
        return {
          today,
          days: [...byDay].map(([date, ms]) => ({ date, ...sumNutrients(ms), meals: ms.length })),
          todaysMeals: (byDay.get(today) ?? []).map((m) => ({
            type: m.mealType,
            description: m.description,
            kcal: m.kcal,
            proteinG: m.proteinG,
            items: m.items,
          })),
        };
      }
      case "get_recent_workouts": {
        const { count } = Count.parse(args);
        const sessions = await db.workoutSession.findMany({
          where: { userId: ctx.userId, endedAt: { not: null } },
          orderBy: { startedAt: "desc" },
          take: count,
          include: { planDay: { select: { name: true } }, sets: { include: { exercise: { select: { name: true } } }, orderBy: { completedAt: "asc" } } },
        });
        return sessions.map((s) => {
          const ex = new Map<string, string[]>();
          for (const set of s.sets) {
            if (set.isWarmup) continue;
            ex.set(set.exercise.name, [...(ex.get(set.exercise.name) ?? []), `${set.weightKg}kg×${set.reps}${set.rpe ? `@${set.rpe}` : ""}`]);
          }
          return { date: s.localDate, name: s.planDay?.name ?? "Workout", notes: s.notes, exercises: Object.fromEntries(ex) };
        });
      }
      case "get_active_plan": {
        const plan = await db.trainingPlan.findFirst({
          where: { userId: ctx.userId, isActive: true },
          include: { days: { orderBy: { dayIndex: "asc" }, include: { exercises: { orderBy: { order: "asc" }, include: { exercise: { select: { slug: true, name: true } } } } } } },
        });
        if (!plan) return { activePlan: null };
        return {
          name: plan.name,
          weeks: plan.weeks,
          notes: plan.notes,
          days: plan.days.map((d) => ({
            name: d.name,
            exercises: d.exercises.map((e) => ({ slug: e.exercise.slug, name: e.exercise.name, sets: e.sets, repMin: e.repMin, repMax: e.repMax, restSec: e.restSec, targetRpe: e.targetRpe })),
          })),
        };
      }
      case "get_body_metrics": {
        const { days } = Days.parse(args);
        return db.bodyMetric.findMany({
          where: { userId: ctx.userId, localDate: { gte: addDays(today, -(days - 1)) } },
          orderBy: { localDate: "asc" },
          select: { localDate: true, weightKg: true, bodyFatPct: true, waistCm: true },
        });
      }
      case "get_exercise_history": {
        const { exerciseName } = ExerciseQuery.parse(args);
        const exercise = await db.exercise.findFirst({
          where: { OR: [{ userId: null }, { userId: ctx.userId }], name: { contains: exerciseName, mode: "insensitive" } },
        });
        if (!exercise) return { error: `No exercise matching "${exerciseName}"` };
        const sets = await db.workoutSet.findMany({
          where: { exerciseId: exercise.id, session: { userId: ctx.userId, endedAt: { not: null } } },
          orderBy: { completedAt: "desc" },
          take: 60,
          include: { session: { select: { localDate: true } } },
        });
        const bySession = new Map<string, typeof sets>();
        for (const s of sets) bySession.set(s.session.localDate, [...(bySession.get(s.session.localDate) ?? []), s]);
        return {
          exercise: exercise.name,
          sessions: [...bySession].slice(0, 6).map(([date, ss]) => ({
            date,
            sets: ss.filter((s) => !s.isWarmup).map((s) => `${s.weightKg}kg×${s.reps}`),
            est1RM: best1RM(ss),
          })),
        };
      }
      case "propose_target_change": {
        const p = TargetProposal.parse(args);
        const floor = KCAL_FLOOR[ctx.sex];
        if (p.targetKcal < floor) return { error: `Refused: calories must be at least ${floor} kcal. Propose a safer target.` };
        if (p.targetKcal > 6000 || p.targetProteinG > 400 || p.targetCarbsG > 900 || p.targetFatG > 300 || p.targetProteinG < 0) {
          return { error: "Values out of a sensible range." };
        }
        proposals.push({ kind: "targets", ...p });
        return { status: "Proposal card shown to the user. Tell them to review and tap Apply to confirm." };
      }
      case "propose_plan": {
        const p = PlanProposal.parse(args);
        proposals.push({ kind: "plan", plan: resolvePlanDraft(p.plan, library), reason: p.reason });
        return { status: "Plan proposal card shown to the user. Tell them to review and tap Apply to save it as their active plan." };
      }
      default:
        return { error: `Unknown tool ${name}` };
    }
  }

  return { tools, execute };
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface CoachCallbacks {
  onDelta: (text: string) => void;
  onProposal: (p: Proposal) => void;
}

const MAX_TOOL_ROUNDS = 5;

/** Run one coach turn: tool loop with streamed text. Returns final text + proposals. */
export async function runCoach(ctx: CoachContext, history: ChatTurn[], cb: CoachCallbacks) {
  const proposals: Proposal[] = [];
  const { tools, execute } = await buildTools(ctx);

  if (isAiMock()) return runMockCoach(ctx, history, cb, execute, proposals);

  let input: ResponseInputItem[] = history.map((m) => ({ role: m.role, content: m.content }));
  let text = "";
  const instructions = coachSystemPrompt(todayLocal(ctx.timezone), ctx.userName);

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const stream = openai().responses.stream({ model: models.smart(), ...reasoningOptions(), instructions, input, tools });
    for await (const event of stream) {
      if (event.type === "response.output_text.delta") {
        text += event.delta;
        cb.onDelta(event.delta);
      }
    }
    const response = await stream.finalResponse();
    const calls = response.output.filter((o) => o.type === "function_call");
    if (calls.length === 0) break;

    const outputs: ResponseInputItem[] = [];
    for (const call of calls) {
      const before = proposals.length;
      console.info(`[coach] tool ${call.name}`);
      let result: unknown;
      try {
        result = await execute(call.name, call.arguments, proposals);
      } catch (e) {
        result = { error: e instanceof Error ? e.message : "Tool failed" };
      }
      for (const p of proposals.slice(before)) cb.onProposal(p);
      outputs.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result) });
    }
    input = [...input, ...(response.output as ResponseInputItem[]), ...outputs];
    if (text && !text.endsWith("\n")) {
      text += "\n\n";
      cb.onDelta("\n\n");
    }
  }

  return { text: text.trim(), proposals };
}

/** Deterministic offline coach used when AI_MOCK=1 or no API key is set. */
async function runMockCoach(
  ctx: CoachContext,
  history: ChatTurn[],
  cb: CoachCallbacks,
  execute: (name: string, args: string, proposals: Proposal[]) => Promise<unknown>,
  proposals: Proposal[],
) {
  const question = history.at(-1)?.content.toLowerCase() ?? "";
  const info = (await execute("get_targets", "{}", proposals)) as {
    targets?: { kcal: number; proteinG: number; carbsG: number; fatG: number };
  };
  const t = info.targets ?? { kcal: 2000, proteinG: 150, carbsG: 200, fatG: 65 };
  let text = `(Mock coach. Set OPENAI_API_KEY for real answers.)\n\nHi ${ctx.userName.split(" ")[0]}! Your daily targets are **${t.kcal} kcal**, ${t.proteinG} g protein, ${t.carbsG} g carbs and ${t.fatG} g fat.`;
  if (question.includes("target") || question.includes("calorie")) {
    const before = proposals.length;
    await execute(
      "propose_target_change",
      JSON.stringify({ targetKcal: t.kcal - 100, targetProteinG: t.proteinG + 10, targetCarbsG: t.carbsG - 30, targetFatG: t.fatG, reason: "Slightly lower calories with more protein to support fat loss." }),
      proposals,
    );
    proposals.slice(before).forEach(cb.onProposal);
    text += "\n\nI've proposed a small adjustment below. Review it and tap **Apply** if you agree.";
  }
  for (const word of text.split(/(?<=\s)/)) cb.onDelta(word);
  return { text, proposals };
}

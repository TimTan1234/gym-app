import "server-only";
import { z } from "zod";
import { zodResponsesFunction } from "openai/helpers/zod";
import type { ResponseInputItem } from "openai/resources/responses/responses";
import { db } from "@/lib/db";
import { addDays, isLocalDate, toLocalTime, todayLocal } from "@/lib/dates";
import { KCAL_FLOOR } from "@/lib/nutrition/targets";
import type { CheckinResult } from "@/lib/nutrition/checkin";
import { describeMissing } from "@/lib/nutrition/checkin-text";
import { createT } from "@/i18n/translate";
import { getCheckin } from "@/lib/queries";
import { sumNutrients } from "@/lib/nutrition/totals";
import { best1RM } from "@/lib/training/summary";
import { isAiMock, models, openai, reasoningOptions, reserveAiCall, AiLimitError } from "./client";
import { analyzeMeal } from "./meal";
import { GetMealsParams, MealDeleteParams, MealLogParams, MealUpdateParams, diffPlans, editMealItems, planShapeOf, type ItemValues, type PlanChange } from "./coach-edits";
import { coachSystemPrompt, diabetesPrompt, languageInstruction } from "./prompts";
import { HYPO_MMOL, classifyReading, summarize, toDisplay, unitLabel, type GlucoseUnit } from "@/lib/glucose";
import { mealResponses, targetsOf, type GlucoseProfile } from "@/lib/glucose-queries";
import type { CarbBudget } from "@/lib/nutrition/diabetes";
import type { Locale } from "@/i18n/config";
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
  | { kind: "plan"; plan: ResolvedPlanDraft; reason: string; applied?: boolean }
  | { kind: "mealLog"; meal: MealDraft; reason: string; applied?: boolean }
  | { kind: "mealUpdate"; mealId: string; before: MealSnapshot; meal: MealDraft; reason: string; applied?: boolean }
  | { kind: "mealDelete"; mealId: string; before: MealSnapshot; reason: string; applied?: boolean }
  | { kind: "planEdit"; planId: string; planName: string; plan: ResolvedPlanDraft; changes: PlanChange[]; reason: string; applied?: boolean };

export type MealType = "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";

/** A meal as it will be saved (items carry full nutrients; totals are recomputed on save). */
export interface MealDraft {
  localDate: string;
  mealType: MealType;
  description: string;
  items: ItemValues[];
}

/** What the meal looked like when the change was proposed, for the confirm card. */
export interface MealSnapshot {
  localDate: string;
  mealType: MealType;
  description: string;
  kcal: number;
  items: { name: string; grams: number; kcal: number }[];
}

export interface CoachContext {
  userId: string;
  userName: string;
  timezone: string;
  sex: "MALE" | "FEMALE";
  /** Interface language; the coach replies in it. */
  locale: Locale;
  /** Set in diabetes mode: adds glucose rules and the get_glucose tool. */
  diabetes: (GlucoseProfile & { type: "PREDIABETES" | "TYPE2"; hypoRiskMeds: boolean; glucoseUnit: GlucoseUnit; budget: CarbBudget }) | null;
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
    ...(ctx.diabetes
      ? [
          zodResponsesFunction({
            name: "get_glucose",
            parameters: Days,
            description:
              "The user's glucose readings (in their unit) with their target status, the share in target, and how logged meals changed their glucose (highest after-meal reading first).",
          }),
        ]
      : []),
    zodResponsesFunction({
      name: "get_weekly_checkin",
      parameters: Empty,
      description:
        "Weekly check-in over the last 14 full days: average intake, weight-trend change per week, estimated real TDEE and, when needed, a suggested calorie target (already capped and floor-checked).",
    }),
    zodResponsesFunction({ name: "get_exercise_history", parameters: ExerciseQuery, description: "Recent sessions and estimated 1RM for one exercise." }),
    zodResponsesFunction({
      name: "propose_target_change",
      parameters: TargetProposal,
      description: "Propose new daily calorie/macro targets. The user must confirm before anything changes.",
    }),
    zodResponsesFunction({
      name: "propose_plan",
      parameters: PlanProposal,
      description:
        "Propose a brand-new training plan (full plan). The user must confirm; it is saved as a new plan and becomes active. To change the current plan, use propose_plan_edit instead.",
    }),
    zodResponsesFunction({
      name: "propose_plan_edit",
      parameters: PlanProposal,
      description:
        "Edit the user's ACTIVE plan in place (swap an exercise, change sets/reps/rest, add or remove a day). Call get_active_plan first and send the whole plan with your edits; keep everything you are not changing exactly as it was. The user sees the differences and must confirm.",
    }),
    zodResponsesFunction({
      name: "get_meals",
      parameters: GetMealsParams,
      description: "Meals logged on one date (last 30 days), with meal ids and item ids, grams and nutrients. Call before editing or deleting a meal.",
    }),
    zodResponsesFunction({
      name: "propose_meal_log",
      parameters: MealLogParams,
      description:
        "Log a meal the user ate. Describe it with quantities; the nutrition is estimated by the meal analyser. The user sees the items and must confirm.",
    }),
    zodResponsesFunction({
      name: "propose_meal_update",
      parameters: MealUpdateParams,
      description:
        "Change a logged meal: new grams for items, remove items, add food, or move it to another meal type. Nutrients are rescaled on the server. The user must confirm.",
    }),
    zodResponsesFunction({
      name: "propose_meal_delete",
      parameters: MealDeleteParams,
      description: "Delete a logged meal. The user must confirm.",
    }),
  ];

  /** The meal-analysis model counts against the user's daily meal-analysis limit. */
  async function analyse(description: string) {
    try {
      const reservation = await reserveAiCall(ctx.userId, "MEAL", todayLocal(ctx.timezone));
      try {
        const analysis = await analyzeMeal({ text: description, locale: ctx.locale });
        if (!analysis.isFood || analysis.items.length === 0) {
          await reservation.refund();
          return { error: "That doesn't describe food. Ask the user what they ate." } as const;
        }
        return { analysis } as const;
      } catch (e) {
        await reservation.refund();
        throw e;
      }
    } catch (e) {
      if (e instanceof AiLimitError) return { error: "The user's daily meal-analysis limit is reached; tell them to log it manually." } as const;
      throw e;
    }
  }

  const recentDate = (date: string, today: string) => isLocalDate(date) && date <= today && date >= addDays(today, -30);

  async function ownMeal(mealId: string) {
    return db.meal.findFirst({ where: { id: mealId, userId: ctx.userId }, include: { items: true } });
  }

  function snapshot(meal: NonNullable<Awaited<ReturnType<typeof ownMeal>>>): MealSnapshot {
    return {
      localDate: meal.localDate,
      mealType: meal.mealType,
      description: meal.description,
      kcal: meal.kcal,
      items: meal.items.map((i) => ({ name: i.name, grams: i.grams, kcal: i.kcal })),
    };
  }

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
            // Same keys as propose_plan_edit, so the model can copy unchanged exercises as they are.
            exercises: d.exercises.map((e) => ({ exerciseSlug: e.exercise.slug, name: e.exercise.name, sets: e.sets, repMin: e.repMin, repMax: e.repMax, restSec: e.restSec, targetRpe: e.targetRpe, notes: e.notes })),
          })),
        };
      }
      case "get_glucose": {
        const d = ctx.diabetes;
        if (!d) return { error: "Diabetes mode is off." };
        const { days } = Days.parse(args);
        const since = addDays(today, -(days - 1));
        const [readings, responses] = await Promise.all([
          db.glucoseReading.findMany({
            where: { userId: ctx.userId, localDate: { gte: since } },
            orderBy: { measuredAt: "asc" },
            include: { meal: { select: { description: true, eatenAt: true } } },
          }),
          mealResponses(ctx.userId, since, d),
        ]);
        const v = (mmol: number) => toDisplay(mmol, d.glucoseUnit);
        const rated = readings.map((r) => {
          const minutesAfterMeal = r.meal ? Math.round((r.measuredAt.getTime() - r.meal.eatenAt.getTime()) / 60000) : null;
          return {
            date: r.localDate,
            time: toLocalTime(r.measuredAt, ctx.timezone),
            context: r.context,
            value: v(r.mmol),
            status: classifyReading({ mmol: r.mmol, context: r.context, minutesAfterMeal }, targetsOf(d)),
            meal: r.meal?.description ?? null,
            minutesAfterMeal,
          };
        });
        return {
          unit: unitLabel(d.glucoseUnit),
          targets: { fastingAndBeforeMeals: [v(d.glucoseFastingMin), v(d.glucoseFastingMax)], afterMealsMax: v(d.glucosePostMealMax) },
          summary: summarize(rated.map((r) => r.status)),
          readings: rated,
          mealResponses: responses.slice(0, 8).map((m) => ({
            meal: m.description,
            date: m.localDate,
            carbsG: Math.round(m.carbsG),
            before: m.beforeMmol === null ? null : v(m.beforeMmol),
            after: v(m.afterMmol),
            minutesAfter: m.minutesAfter,
            status: m.status,
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
      case "get_weekly_checkin": {
        const profile = await db.profile.findUnique({ where: { userId: ctx.userId } });
        if (!profile) return { error: "No profile" };
        const checkin = await getCheckin(ctx.userId, profile);
        return {
          ...checkin,
          currentTargets: { kcal: profile.targetKcal, proteinG: profile.targetProteinG, carbsG: profile.targetCarbsG, fatG: profile.targetFatG },
          goal: profile.goal,
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
      case "propose_plan_edit": {
        const p = PlanProposal.parse(args);
        const active = await db.trainingPlan.findFirst({
          where: { userId: ctx.userId, isActive: true },
          include: { days: { orderBy: { dayIndex: "asc" }, include: { exercises: { orderBy: { order: "asc" }, include: { exercise: { select: { slug: true, name: true } } } } } } },
        });
        if (!active) return { error: "The user has no active plan. Use propose_plan to create one." };
        const plan = resolvePlanDraft(p.plan, library);
        const changes = diffPlans(planShapeOf(active.days), plan);
        if (changes.length === 0) return { error: "That plan is identical to the current one. Make the requested change." };
        proposals.push({ kind: "planEdit", planId: active.id, planName: active.name, plan, changes, reason: p.reason });
        return { status: "Edit card shown with the differences. Tell the user to review it and tap Apply.", changes };
      }
      case "get_meals": {
        const { date } = GetMealsParams.parse(args);
        if (!recentDate(date, today)) return { error: `Use a date between ${addDays(today, -30)} and ${today}.` };
        const meals = await db.meal.findMany({ where: { userId: ctx.userId, localDate: date }, include: { items: true }, orderBy: { eatenAt: "asc" } });
        return {
          date,
          meals: meals.map((m) => ({
            mealId: m.id,
            type: m.mealType,
            description: m.description,
            kcal: m.kcal,
            items: m.items.map((i) => ({ itemId: i.id, name: i.name, quantity: i.quantity, unit: i.unit, grams: i.grams, kcal: i.kcal, proteinG: i.proteinG, carbsG: i.carbsG, fatG: i.fatG, sugarG: i.sugarG, addedSugarG: i.addedSugarG, gi: i.gi })),
          })),
        };
      }
      case "propose_meal_log": {
        const p = MealLogParams.parse(args);
        if (!recentDate(p.date, today)) return { error: `Meals can be logged for ${addDays(today, -30)} to ${today}.` };
        const result = await analyse(p.description);
        if ("error" in result) return { error: result.error };
        const { analysis } = result;
        proposals.push({
          kind: "mealLog",
          meal: { localDate: p.date, mealType: p.mealType, description: analysis.title || p.description.slice(0, 120), items: analysis.items },
          reason: p.reason,
        });
        return { status: "Meal card shown. Tell the user to check the items and tap Apply to log it.", items: analysis.items.map((i) => ({ name: i.name, grams: i.grams, kcal: i.kcal })) };
      }
      case "propose_meal_update": {
        const p = MealUpdateParams.parse(args);
        const meal = await ownMeal(p.mealId);
        if (!meal) return { error: "No meal with that id. Call get_meals to find it." };
        const { items, unknownIds } = editMealItems(meal.items, p.changes);
        if (unknownIds.length) return { error: `Unknown item ids: ${unknownIds.join(", ")}. Use item ids from get_meals.` };
        if (p.addDescription?.trim()) {
          const result = await analyse(p.addDescription);
          if ("error" in result) return { error: result.error };
          items.push(...result.analysis.items);
        }
        if (items.length === 0) return { error: "That would leave the meal empty. Use propose_meal_delete instead." };
        proposals.push({
          kind: "mealUpdate",
          mealId: meal.id,
          before: snapshot(meal),
          meal: { localDate: meal.localDate, mealType: p.mealType ?? meal.mealType, description: meal.description, items },
          reason: p.reason,
        });
        return { status: "Edit card shown with before and after. Tell the user to tap Apply to save it.", newKcal: sumNutrients(items).kcal };
      }
      case "propose_meal_delete": {
        const p = MealDeleteParams.parse(args);
        const meal = await ownMeal(p.mealId);
        if (!meal) return { error: "No meal with that id. Call get_meals to find it." };
        proposals.push({ kind: "mealDelete", mealId: meal.id, before: snapshot(meal), reason: p.reason });
        return { status: "Delete card shown. Tell the user to tap Delete to confirm." };
      }
      default:
        return { error: `Unknown tool ${name}` };
    }
  }

  // Plain tool definitions: with the zod helpers attached, the SDK parses the
  // arguments itself and a single malformed call aborts the whole reply. Our
  // execute() parses them instead and hands any error back to the model.
  const plainTools = tools.map(({ type, name, description, parameters, strict }) => ({ type, name, description, parameters, strict }));
  return { tools: plainTools, execute };
}

/** A short error the model can act on (zod's enum errors list every slug otherwise). */
function toolError(e: unknown): string {
  if (e instanceof z.ZodError) {
    return (
      "Invalid arguments: " +
      e.issues
        .slice(0, 5)
        .map((i) => `${i.path.join(".")}: ${i.code === "invalid_value" ? "not an allowed value" : i.message}`)
        .join("; ")
    );
  }
  return e instanceof Error ? e.message.slice(0, 300) : "Tool failed";
}

/**
 * What the cards on an earlier reply proposed and whether the user applied them.
 * Appended to that reply in the history, so the model edits a meal that is
 * already logged instead of logging it a second time.
 */
export function describeProposals(proposals: Proposal[]): string {
  if (proposals.length === 0) return "";
  const what = (p: Proposal) => {
    switch (p.kind) {
      case "targets":
        return `new targets ${p.targetKcal} kcal`;
      case "plan":
        return `new plan "${p.plan.name}"`;
      case "planEdit":
        return `edit to the plan "${p.planName}"`;
      case "mealLog":
        return `log ${p.meal.mealType} "${p.meal.description}" on ${p.meal.localDate}`;
      case "mealUpdate":
        return `update meal "${p.before.description}" on ${p.before.localDate}`;
      case "mealDelete":
        return `delete meal "${p.before.description}" on ${p.before.localDate}`;
    }
  };
  const list = proposals.map((p, i) => `${i + 1}) ${what(p)}: ${p.applied ? "applied by the user" : "not applied"}`).join("; ");
  return `\n\n[Proposal cards on this reply: ${list}.]`;
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
  const d = ctx.diabetes;
  const instructions =
    coachSystemPrompt(todayLocal(ctx.timezone), ctx.userName) +
    (d
      ? diabetesPrompt({
          type: d.type,
          hypoRiskMeds: d.hypoRiskMeds,
          unit: unitLabel(d.glucoseUnit),
          fasting: `${toDisplay(d.glucoseFastingMin, d.glucoseUnit)}-${toDisplay(d.glucoseFastingMax, d.glucoseUnit)}`,
          postMealMax: String(toDisplay(d.glucosePostMealMax, d.glucoseUnit)),
          low: String(toDisplay(HYPO_MMOL, d.glucoseUnit)),
          mealCarbs: `${d.budget.meal.min}-${d.budget.meal.max}`,
          snackCarbs: `${d.budget.snack.min}-${d.budget.snack.max}`,
        })
      : "") +
    languageInstruction(ctx.locale);

  const started = Date.now();
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const roundStart = Date.now();
    let firstToken = 0;
    const stream = openai().responses.stream({ model: models.smart(), ...reasoningOptions(), instructions, input, tools });
    for await (const event of stream) {
      if (event.type === "response.output_text.delta") {
        firstToken ||= Date.now() - roundStart;
        text += event.delta;
        cb.onDelta(event.delta);
      }
    }
    const response = await stream.finalResponse();
    const calls = response.output.filter((o) => o.type === "function_call");
    // Timing per model round, to see where a slow reply spends its time.
    console.info(
      `[coach] round ${round + 1}: ${Date.now() - roundStart} ms` +
        (firstToken ? `, first text at ${firstToken} ms` : "") +
        (calls.length ? `, tools ${calls.map((c) => c.name).join(", ")}` : "") +
        (response.usage ? `, tokens in ${response.usage.input_tokens} out ${response.usage.output_tokens}` : ""),
    );
    if (calls.length === 0) break;

    const outputs: ResponseInputItem[] = [];
    for (const call of calls) {
      const before = proposals.length;
      let result: unknown;
      try {
        result = await execute(call.name, call.arguments, proposals);
      } catch (e) {
        result = { error: toolError(e) };
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

  console.info(`[coach] reply done in ${Date.now() - started} ms`);
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
  const proposeMock = async (tool: string, args: object) => {
    const before = proposals.length;
    const result = await execute(tool, JSON.stringify(args), proposals);
    if (result && typeof result === "object" && "error" in result) console.warn(`[coach] mock ${tool}:`, result.error);
    proposals.slice(before).forEach(cb.onProposal);
  };
  let text = `(Mock coach. Set OPENAI_API_KEY for real answers.)\n\nHi ${ctx.userName.split(" ")[0]}! Your daily targets are **${t.kcal} kcal**, ${t.proteinG} g protein, ${t.carbsG} g carbs and ${t.fatG} g fat.`;
  // The mock recognises the check-in prompt in either language.
  if (question.includes("check-in") || question.includes("复盘")) {
    const c = (await execute("get_weekly_checkin", "{}", proposals)) as CheckinResult;
    if (c.status === "adjust" && c.suggested) {
      const before = proposals.length;
      const s = c.suggested;
      await execute(
        "propose_target_change",
        JSON.stringify({ targetKcal: s.kcal, targetProteinG: s.proteinG, targetCarbsG: s.carbsG, targetFatG: s.fatG, reason: `Your estimated burn is ${c.estimatedTdee} kcal a day.` }),
        proposals,
      );
      proposals.slice(before).forEach(cb.onProposal);
      text += `\n\nWeekly check-in: you're burning about **${c.estimatedTdee} kcal** a day. I've proposed ${s.kcal} kcal below.`;
    } else {
      const verdict =
        c.status === "on_track"
          ? "you're on track, keep your targets."
          : c.status === "waiting"
            ? `your targets changed recently. Next check-in on ${c.nextOn}.`
            : `not enough data yet. Still needed: ${c.missing.map((m) => describeMissing(createT("en"), m)).join(", ")}.`;
      text += `\n\nWeekly check-in: ${verdict}`;
    }
  } else if (ctx.diabetes && (question.includes("glucose") || question.includes("血糖"))) {
    const g = (await execute("get_glucose", JSON.stringify({ days: 14 }), proposals)) as { summary: { inTarget: number; rated: number }; unit: string };
    text += `\n\nGlucose: ${g.summary.inTarget} of ${g.summary.rated} readings in target (${g.unit}).`;
  } else if (question.includes("swap")) {
    // Swap day 1's first exercise for a chest press it doesn't already have.
    const plan = (await execute("get_active_plan", "{}", proposals)) as {
      name: string;
      weeks: number;
      notes: string | null;
      days?: { name: string; exercises: { exerciseSlug: string; sets: number; repMin: number; repMax: number; restSec: number; targetRpe: number | null }[] }[];
    };
    if (plan.days) {
      const inDay1 = new Set(plan.days[0].exercises.map((e) => e.exerciseSlug));
      const swapTo = ["dumbbell-bench-press", "machine-chest-press", "push-up"].find((slug) => !inDay1.has(slug))!;
      const days = plan.days.map((d, i) => ({
        name: d.name,
        exercises: d.exercises.map((e, j) => ({ ...e, exerciseSlug: i === 0 && j === 0 ? swapTo : e.exerciseSlug, notes: null })),
      }));
      await proposeMock("propose_plan_edit", { plan: { name: plan.name, notes: plan.notes ?? "", weeks: plan.weeks, days }, reason: "A variation for the same muscles." });
      text += "\n\nHere's the swap. Tap **Apply** to update your plan.";
    } else text += "\n\nYou don't have an active plan yet.";
  } else if (question.includes("delete") || question.includes("grams")) {
    const { meals } = (await execute("get_meals", JSON.stringify({ date: todayLocal(ctx.timezone) }), proposals)) as { meals: { mealId: string; items: { itemId: string }[] }[] };
    const meal = meals[0];
    if (!meal) text += "\n\nYou haven't logged any meals today.";
    else if (question.includes("delete")) {
      await proposeMock("propose_meal_delete", { mealId: meal.mealId, reason: "You asked to remove it." });
      text += "\n\nTap **Delete meal** to remove it.";
    } else {
      const changes = [{ itemId: meal.items[0].itemId, newGrams: 150, remove: false }];
      await proposeMock("propose_meal_update", { mealId: meal.mealId, changes, addDescription: null, mealType: null, reason: "Portion corrected to 150 g." });
      text += "\n\nHere's the corrected meal. Tap **Apply** to save it.";
    }
  } else if (question.startsWith("log ")) {
    await proposeMock("propose_meal_log", { description: history.at(-1)!.content.slice(4), mealType: "LUNCH", date: todayLocal(ctx.timezone), reason: "Logged from your message." });
    text += "\n\nTap **Apply** to add it to today.";
  } else if (question.includes("target") || question.includes("calorie")) {
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

import "server-only";
import { zodTextFormat } from "openai/helpers/zod";
import type { ResponseInputContent } from "openai/resources/responses/responses";
import type { z } from "zod";
import { isAiMock, models, openai, reasoningOptions } from "./client";
import {
  PROCUREMENT_GENERATE_PROMPT,
  PROCUREMENT_IMPORT_PROMPT,
  PROCUREMENT_NUTRITION_RULES,
  languageInstruction,
  procurementDiabetesPrompt,
} from "./prompts";
import {
  GeneratedPlanSchema,
  GroceryNutritionSchema,
  ProcurementDraftSchema,
  type DraftPlan,
  type ProcurementDraft,
  type ProcurementGenerate,
} from "./schemas";
import type { Locale } from "@/i18n/config";
import { carbBudget } from "@/lib/nutrition/diabetes";
import type { ActivityLevel, Sex } from "@/lib/nutrition/targets";
import mockPlan from "./fixtures/procurement.json";

// A long list with nutrition for every item is a big structured output; leave
// room for reasoning tokens too.
const MAX_OUTPUT_TOKENS = 32_000;

/** The model stopped before finishing (usually a very long list). */
export class ProcurementTooLongError extends Error {
  constructor(detail?: string) {
    super(`The plan was too long to read in one go${detail ? ` (${detail})` : ""}.`);
  }
}

/**
 * Run a structured-output request. The SDK skips parsing an "incomplete"
 * response, but a compatible provider that leaves `status` unset gets its
 * cut-off JSON parsed, which throws a SyntaxError: both mean the output ran out.
 */
async function parseOrTooLong<R extends { status?: string | null }>(request: () => Promise<R>): Promise<R> {
  let response: R;
  try {
    response = await request();
  } catch (e) {
    if (e instanceof SyntaxError) throw new ProcurementTooLongError(`unparseable output: ${e.message}`);
    throw e;
  }
  if (response.status === "incomplete") throw new ProcurementTooLongError(`incomplete: ${JSON.stringify((response as { incomplete_details?: unknown }).incomplete_details ?? null)}`);
  return response;
}

/** The profile fields the procurement prompts need, for `db.profile.findUnique({ select })`. */
export const PROCUREMENT_PROFILE_SELECT = {
  timezone: true,
  targetKcal: true,
  targetProteinG: true,
  targetCarbsG: true,
  targetFatG: true,
  diabetesMode: true,
  sex: true,
  activityLevel: true,
} as const;

export interface ProcurementProfile {
  targetKcal: number;
  targetProteinG: number;
  targetCarbsG: number;
  targetFatG: number;
  diabetesMode: boolean;
  sex: Sex;
  activityLevel: ActivityLevel;
}

function profileContext(p: ProcurementProfile) {
  return `The user's daily targets: ${p.targetKcal} kcal, protein ${p.targetProteinG} g, carbs ${p.targetCarbsG} g, fat ${p.targetFatG} g.`;
}

function instructions(base: string, p: ProcurementProfile, locale: Locale) {
  let text = base;
  if (p.diabetesMode) {
    const b = carbBudget(p.sex, p.activityLevel);
    text += procurementDiabetesPrompt(`${b.meal.min}-${b.meal.max}`, `${b.snack.min}-${b.snack.max}`);
  }
  return text + languageInstruction(locale);
}

async function parsePlan<S extends z.ZodType>(
  schema: S,
  request: {
    model: string;
    instructions: string;
    content: ResponseInputContent[];
    reasoning?: boolean;
  },
): Promise<z.infer<S>> {
  const response = await parseOrTooLong(() =>
    openai().responses.parse({
      model: request.model,
      ...(request.reasoning ? reasoningOptions() : {}),
      max_output_tokens: MAX_OUTPUT_TOKENS,
      instructions: request.instructions,
      input: [{ role: "user", content: request.content }],
      text: { format: zodTextFormat(schema, "procurement_plan") },
    }),
  );
  if (!response.output_parsed) throw new Error("The AI did not return a plan. Please try again.");
  return schema.parse(response.output_parsed);
}

export interface ImportInput {
  text: string;
  /** data:image/...;base64 */
  images: string[];
  days: number;
  people: number;
  profile: ProcurementProfile;
  locale: Locale;
}

export async function parseProcurement(input: ImportInput): Promise<ProcurementDraft> {
  if (isAiMock()) return normalizeDraft(ProcurementDraftSchema.parse(mockPlan));

  const content: ResponseInputContent[] = [
    {
      type: "input_text",
      text: [
        `Plan period: ${input.days} days for ${input.people} ${input.people === 1 ? "person" : "people"}, unless the input says otherwise. Use this for each item's eaten share.`,
        profileContext(input.profile),
        input.text ? `\nThe list or plan:\n${input.text}` : "\nThe list or plan is in the photos.",
      ].join("\n"),
    },
    ...input.images.map((url): ResponseInputContent => ({ type: "input_image", image_url: url, detail: "high" })),
  ];
  const draft = await parsePlan(ProcurementDraftSchema, {
    model: models.fast(),
    instructions: instructions(PROCUREMENT_IMPORT_PROMPT, input.profile, input.locale),
    content,
  });
  return normalizeDraft(draft);
}

export async function generateProcurement(
  req: ProcurementGenerate,
  profile: ProcurementProfile,
  locale: Locale,
): Promise<DraftPlan> {
  if (isAiMock()) {
    const draft = withoutNutrition(GeneratedPlanSchema.parse(mockPlan));
    return { ...draft, days: req.days, people: req.people, budget: req.budget };
  }
  const text = [
    `Plan period: ${req.days} days for ${req.people} ${req.people === 1 ? "person" : "people"}.`,
    profileContext(profile),
    `Currency: ${req.currency}.`,
    `Budget: ${req.budget != null ? `${req.budget} ${req.currency} in total` : "none given; keep it economical"}.`,
    `Preferences: ${req.preferences || "none"}.`,
  ].join("\n");
  // No per-item nutrition here: it is estimated after saving (Nutrition tab).
  const draft = await parsePlan(GeneratedPlanSchema, {
    model: models.plan(),
    reasoning: true,
    instructions: instructions(PROCUREMENT_GENERATE_PROMPT, profile, locale),
    content: [{ type: "input_text", text }],
  });
  return withoutNutrition(draft);
}

export type GroceryNutrition = z.infer<typeof GroceryNutritionSchema>["items"][number];

/** Nutrition for items typed in by hand, keyed by their position in `items`. */
export async function estimateItems(
  items: { name: string; quantity: number; unit: string }[],
  plan: { days: number; people: number },
  locale: Locale,
): Promise<Map<number, GroceryNutrition>> {
  if (isAiMock()) {
    // Reuse the fixture's first food item for every request.
    const sample = ProcurementDraftSchema.parse(mockPlan).items[0];
    return new Map(items.map((_, index) => [index, { index, ...pickPortion(sample) }]));
  }
  const list = items.map((i, index) => `${index}. ${i.name}: ${i.quantity} ${i.unit}`).join("\n");
  const response = await parseOrTooLong(() =>
    openai().responses.parse({
      model: models.fast(),
      max_output_tokens: MAX_OUTPUT_TOKENS,
      instructions:
        "Estimate nutrition for each grocery item. Return one entry per item with its index.\n\n" + PROCUREMENT_NUTRITION_RULES + languageInstruction(locale),
      input: `Plan period: ${plan.days} days for ${plan.people} ${plan.people === 1 ? "person" : "people"}.\n\nItems:\n${list}`,
      text: { format: zodTextFormat(GroceryNutritionSchema, "grocery_nutrition") },
    }),
  );
  const parsed = response.output_parsed;
  if (!parsed) throw new Error("The AI did not return nutrition. Please try again.");
  const result = new Map<number, GroceryNutrition>();
  for (const entry of GroceryNutritionSchema.parse(parsed).items) {
    if (entry.index < items.length) result.set(entry.index, normalizePortion(entry));
  }
  return result;
}

function pickPortion<T extends GroceryNutrition | ProcurementDraft["items"][number]>(i: T) {
  const { consumedGrams, kcal, proteinG, carbsG, fatG, fiberG, sugarG, addedSugarG, sodiumMg, gi } = i;
  return { consumedGrams, kcal, proteinG, carbsG, fatG, fiberG, sugarG, addedSugarG, sodiumMg, gi };
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Round so the editor shows clean values; added sugar never exceeds total sugar. */
function normalizePortion<T extends ReturnType<typeof pickPortion>>(i: T): T {
  return {
    ...i,
    consumedGrams: Math.round(i.consumedGrams),
    kcal: Math.round(i.kcal),
    proteinG: r1(i.proteinG),
    carbsG: r1(i.carbsG),
    fatG: r1(i.fatG),
    fiberG: r1(i.fiberG),
    sugarG: r1(i.sugarG),
    addedSugarG: r1(Math.min(i.addedSugarG, i.sugarG)),
    sodiumMg: Math.round(i.sodiumMg),
    gi: i.gi === null || i.carbsG < 5 ? null : Math.round(i.gi),
  };
}

const currencyOf = (c: string | null) => (c && /^[A-Za-z]{3}$/.test(c) ? c.toUpperCase() : null);

export function normalizeDraft(draft: ProcurementDraft): ProcurementDraft {
  return {
    ...draft,
    currency: currencyOf(draft.currency),
    items: draft.items.map((i) => ({
      ...normalizePortion(i),
      quantity: r2(i.quantity),
      estPrice: i.estPrice == null ? null : r2(i.estPrice),
    })),
  };
}

const UNESTIMATED = {
  consumedGrams: null,
  kcal: null,
  proteinG: null,
  carbsG: null,
  fatG: null,
  fiberG: null,
  sugarG: null,
  addedSugarG: null,
  sodiumMg: null,
  gi: null,
};

/** A generated plan as a draft whose items still need their nutrition estimated. */
function withoutNutrition(draft: z.infer<typeof GeneratedPlanSchema>): DraftPlan {
  return {
    ...draft,
    currency: currencyOf(draft.currency),
    items: draft.items.map((i) => ({
      ...i,
      quantity: r2(i.quantity),
      estPrice: i.estPrice == null ? null : r2(i.estPrice),
      ...UNESTIMATED,
    })),
  };
}

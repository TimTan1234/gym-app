import "server-only";
import { zodTextFormat } from "openai/helpers/zod";
import type { ResponseInputContent } from "openai/resources/responses/responses";
import { isAiMock, models, openai } from "./client";
import { MEAL_SYSTEM_PROMPT, languageInstruction } from "./prompts";
import type { Locale } from "@/i18n/config";
import { MealAnalysisSchema, type MealAnalysis } from "./schemas";
import mockMeal from "./fixtures/meal.json";

export interface MealInput {
  text?: string;
  /** data:image/jpeg;base64,... (already resized client-side) */
  imageDataUrl?: string;
  /** Language for item names, assumptions, notes and title. */
  locale?: Locale;
}

export async function analyzeMeal(input: MealInput): Promise<MealAnalysis> {
  if (isAiMock()) return normalize(MealAnalysisSchema.parse(mockMeal));

  const content: ResponseInputContent[] = [];
  content.push({
    type: "input_text",
    text: input.text?.trim() ? `Meal description: ${input.text.trim()}` : "Estimate the nutrition of the meal in this photo.",
  });
  if (input.imageDataUrl) {
    content.push({ type: "input_image", image_url: input.imageDataUrl, detail: "auto" });
  }

  const response = await openai().responses.parse({
    model: models.fast(),
    instructions: MEAL_SYSTEM_PROMPT + languageInstruction(input.locale ?? "en"),
    input: [{ role: "user", content }],
    text: { format: zodTextFormat(MealAnalysisSchema, "meal_analysis") },
  });

  const parsed = response.output_parsed;
  if (!parsed) throw new Error("The AI did not return a nutrition estimate. Please try again.");
  return normalize(MealAnalysisSchema.parse(parsed));
}

/** Round numbers so the draft editor shows clean values. */
function normalize(analysis: MealAnalysis): MealAnalysis {
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return {
    ...analysis,
    items: analysis.items.map((i) => ({
      ...i,
      grams: Math.round(i.grams),
      kcal: Math.round(i.kcal),
      proteinG: r1(i.proteinG),
      carbsG: r1(i.carbsG),
      fatG: r1(i.fatG),
      fiberG: r1(i.fiberG),
      sugarG: r1(i.sugarG),
      sodiumMg: Math.round(i.sodiumMg),
    })),
  };
}

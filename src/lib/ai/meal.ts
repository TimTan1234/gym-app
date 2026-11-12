import "server-only";
import { zodTextFormat } from "openai/helpers/zod";
import type { ResponseInputContent } from "openai/resources/responses/responses";
import { isAiMock, models, openai } from "./client";
import { MEAL_SYSTEM_PROMPT, languageInstruction } from "./prompts";
import type { Locale } from "@/i18n/config";
import { MealAnalysisSchema, type MealAnalysis } from "./schemas";
import mockMeal from "./fixtures/meal.json";
import mockDrinks from "./fixtures/meal-drinks.json";

export interface MealInput {
  text?: string;
  /** data:image/jpeg;base64,... (already resized client-side); several dishes, or one from different angles. */
  imageDataUrls?: string[];
  /** Language for item names, assumptions, notes and title. */
  locale?: Locale;
}

export async function analyzeMeal(input: MealInput): Promise<MealAnalysis> {
  // The mock answers a drink order with drinks, and anything else with nasi lemak.
  if (isAiMock()) return normalize(MealAnalysisSchema.parse(/teh|kopi/i.test(input.text ?? "") ? mockDrinks : mockMeal));

  const content: ResponseInputContent[] = [];
  const photos = input.imageDataUrls ?? [];
  const lines = [input.text?.trim() ? `Meal description: ${input.text.trim()}` : `Estimate the nutrition of the meal in ${photos.length > 1 ? "these photos" : "this photo"}.`];
  if (photos.length > 1) {
    lines.push(
      `There are ${photos.length} photos of one meal. They may show different dishes, or the same food from other angles or closer up: count each food once, never twice because it appears in two photos.`,
    );
  }
  content.push({ type: "input_text", text: lines.join("\n") });
  for (const url of photos) content.push({ type: "input_image", image_url: url, detail: "auto" });

  const request = async (): Promise<MealAnalysis | null> => {
    try {
      const response = await openai().responses.parse({
        model: models.fast(),
        instructions: MEAL_SYSTEM_PROMPT + languageInstruction(input.locale ?? "en"),
        input: [{ role: "user", content }],
        text: { format: zodTextFormat(MealAnalysisSchema, "meal_analysis") },
      });
      const parsed = MealAnalysisSchema.safeParse(response.output_parsed);
      return parsed.success ? parsed.data : null;
    } catch (e) {
      if (unreadable(e)) return null;
      throw e;
    }
  };

  // Not every provider holds the model to the schema, so an unreadable reply gets one more try.
  const analysis = (await request()) ?? (await request());
  if (!analysis) throw new Error("The AI did not return a nutrition estimate. Please try again.");
  return normalize(analysis);
}

/** The reply wasn't JSON, or not the schema's: the SDK's own parse throws these. */
function unreadable(e: unknown) {
  return e instanceof SyntaxError || (e instanceof Error && e.name === "ZodError");
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
      addedSugarG: r1(Math.min(i.addedSugarG, i.sugarG)),
      // GI only means something for food with real carbs.
      gi: i.gi === null || i.carbsG < 5 ? null : Math.round(i.gi),
      sodiumMg: Math.round(i.sodiumMg),
      // Two decimals keep a drink's grade where its per-100 ml value puts it.
      saturatedFatG: Math.round(Math.min(i.saturatedFatG, i.fatG) * 100) / 100,
      volumeMl: i.volumeMl ? Math.round(i.volumeMl) : null,
    })),
  };
}

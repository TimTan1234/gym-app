import { z } from "zod";

// ---------- Meal analysis ----------
// Strict structured outputs require every key to be present, so "optional"
// values are nullable instead.

export const MealItemDraftSchema = z.object({
  name: z.string().min(1).max(120),
  quantity: z.number().nonnegative(),
  unit: z.string().max(30).describe("e.g. 'piece', 'cup', 'plate', 'g', 'ml'"),
  grams: z.number().nonnegative().describe("Estimated edible weight in grams"),
  kcal: z.number().nonnegative(),
  proteinG: z.number().nonnegative(),
  carbsG: z.number().nonnegative(),
  fatG: z.number().nonnegative(),
  fiberG: z.number().nonnegative(),
  sugarG: z.number().nonnegative().describe("Total sugars"),
  addedSugarG: z.number().nonnegative().describe("Added (free) sugars only, at most sugarG"),
  sodiumMg: z.number().nonnegative(),
  gi: z.number().int().min(0).max(110).nullable().describe("Estimated glycaemic index of this food (glucose = 100), or null if it has under 5 g carbs"),
  confidence: z.number().min(0).max(1).describe("0–1 confidence in this estimate"),
  assumptions: z.string().max(300).nullable().describe("Portion/cooking assumptions made"),
});

export const MealAnalysisSchema = z.object({
  isFood: z.boolean().describe("false if the input does not describe or show food"),
  title: z.string().max(80).describe("Short name for the whole meal"),
  items: z.array(MealItemDraftSchema).max(20),
  notes: z.string().max(400).nullable(),
});

export type MealItemDraft = z.infer<typeof MealItemDraftSchema>;
export type MealAnalysis = z.infer<typeof MealAnalysisSchema>;

// ---------- Training plan ----------

export const PlanRequestSchema = z.object({
  goal: z.enum(["STRENGTH", "HYPERTROPHY", "FAT_LOSS", "GENERAL_FITNESS", "ENDURANCE"]),
  daysPerWeek: z.number().int().min(1).max(7),
  sessionMinutes: z.number().int().min(20).max(180),
  experience: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]),
  equipment: z.array(z.string()).min(1),
  focusMuscles: z.array(z.string()).default([]),
  limitations: z.string().max(500).default(""),
});
export type PlanRequest = z.infer<typeof PlanRequestSchema>;

/** Plan schema with exerciseSlug constrained to the library. */
export function planDraftSchema(slugs: readonly [string, ...string[]]) {
  return z.object({
    name: z.string().max(80),
    notes: z.string().max(800).describe("Short explanation of the split and progression"),
    weeks: z.number().int().min(1).max(16),
    days: z
      .array(
        z.object({
          name: z.string().max(60).describe("e.g. 'Push A', 'Lower B', 'Full body A'"),
          exercises: z
            .array(
              z.object({
                exerciseSlug: z.enum(slugs),
                sets: z.number().int().min(1).max(10),
                repMin: z.number().int().min(1).max(50),
                repMax: z.number().int().min(1).max(50),
                targetRpe: z.number().min(5).max(10).nullable(),
                restSec: z.number().int().min(30).max(600),
                notes: z.string().max(200).nullable(),
              }),
            )
            .min(1)
            .max(12),
        }),
      )
      .min(1)
      .max(7),
  });
}
export type PlanDraft = z.infer<ReturnType<typeof planDraftSchema>>;

// ---------- Saving (client → server) ----------

export const MealSaveSchema = z.object({
  mealType: z.enum(["BREAKFAST", "LUNCH", "DINNER", "SNACK"]),
  description: z.string().min(1).max(300),
  source: z.enum(["AI_TEXT", "AI_PHOTO", "MANUAL"]),
  eatenAt: z.iso.datetime(),
  /** Wall-clock time eaten ("HH:MM") on localDate, in the user's timezone; overrides eatenAt. */
  eatenTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  /** Optional explicit local date (when logging for a past day). */
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(400).nullable().optional(),
  items: z
    .array(
      MealItemDraftSchema.extend({
        confidence: z.number().min(0).max(1).nullable(),
        // Absent on drafts made before these were tracked (e.g. an old coach card).
        addedSugarG: z.number().nonnegative().default(0),
        gi: z.number().int().min(0).max(110).nullable().default(null),
      })
        // Added sugar is part of total sugar.
        .transform((i) => ({ ...i, addedSugarG: Math.min(i.addedSugarG, i.sugarG) })),
    )
    .min(1)
    .max(30),
});
export type MealSave = z.infer<typeof MealSaveSchema>;

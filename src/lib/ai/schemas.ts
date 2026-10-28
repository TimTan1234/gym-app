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

/** Photos one meal analysis can take: several dishes, or one dish from different angles. */
export const MAX_MEAL_PHOTOS = 4;

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

// ---------- Procurement (groceries) ----------

export const GROCERY_CATEGORIES = ["PRODUCE", "MEAT_SEAFOOD", "DAIRY_EGGS", "GRAINS_BREAD", "PANTRY", "FROZEN", "DRINKS", "SNACKS", "OTHER"] as const;
export type GroceryCategory = (typeof GROCERY_CATEGORIES)[number];

export const PROCUREMENT_SOURCES = ["IMAGE", "MARKDOWN", "DOCX", "PDF", "TEXT", "MIXED", "AI", "MANUAL"] as const;
export type ProcurementSource = (typeof PROCUREMENT_SOURCES)[number];

const MEAL_TYPES = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"] as const;

// Nutrients describe the share one person eats during the plan, not the whole
// purchase: a 5 kg bag of rice for a family is mostly someone else's.
const portion = {
  consumedGrams: z
    .number()
    .nonnegative()
    .describe("Edible grams of this item that ONE person eats during the whole plan period (their share of the purchase)"),
  kcal: z.number().nonnegative().describe("For consumedGrams"),
  proteinG: z.number().nonnegative(),
  carbsG: z.number().nonnegative(),
  fatG: z.number().nonnegative(),
  fiberG: z.number().nonnegative(),
  sugarG: z.number().nonnegative().describe("Total sugars"),
  addedSugarG: z.number().nonnegative().describe("Added (free) sugars only, at most sugarG"),
  sodiumMg: z.number().nonnegative(),
  gi: MealItemDraftSchema.shape.gi,
};

const groceryItem = {
  name: z.string().min(1).max(120),
  quantity: z.number().nonnegative().describe("Amount to buy"),
  unit: z.string().max(30).describe("Purchase unit, e.g. 'kg', 'g', 'pack', 'bottle', 'piece', 'bunch'"),
  category: z.enum(GROCERY_CATEGORIES),
  estPrice: z.number().nonnegative().nullable().describe("Price for the whole quantity in the plan currency: the stated price, else a typical local price"),
  store: z.string().max(60).nullable().describe("Shop or market if the source names one"),
};

export const GroceryItemDraftSchema = z.object({ ...groceryItem, ...portion });

export const PlannedMealSchema = z.object({
  day: z.number().int().min(1).max(31).describe("1-based day of the plan"),
  mealType: z.enum(MEAL_TYPES),
  description: z.string().min(1).max(200),
});

export const ProcurementDraftSchema = z.object({
  isPlan: z.boolean().describe("false if the input is not a grocery list, shopping list or meal plan"),
  title: z.string().max(80).describe("Short name, e.g. 'Week of 3 Nov groceries'"),
  days: z.number().int().min(1).max(31).nullable().describe("Days the food should cover, if stated or clear"),
  people: z.number().int().min(1).max(12).nullable().describe("People the food is for, if stated"),
  budget: z.number().nonnegative().nullable().describe("Budget for the whole plan, if stated"),
  currency: z.string().max(3).nullable().describe("ISO 4217 code (MYR, SGD, USD…) if stated or obvious, else null"),
  items: z.array(GroceryItemDraftSchema).max(80),
  meals: z.array(PlannedMealSchema).max(60),
  notes: z.string().max(400).nullable(),
});

/**
 * A generated plan leaves out per-item nutrition: it roughly doubles the output
 * and the wait. It is estimated after saving, from the plan's Nutrition tab.
 */
export const GeneratedPlanSchema = ProcurementDraftSchema.extend({
  items: z.array(z.object(groceryItem)).max(80),
});

export type GroceryItemDraft = z.infer<typeof GroceryItemDraftSchema>;
export type PlannedMeal = z.infer<typeof PlannedMealSchema>;
export type ProcurementDraft = z.infer<typeof ProcurementDraftSchema>;

type PortionKey = keyof typeof portion;
/** A draft item as the editor receives it: nutrition is null until estimated. */
export type DraftGroceryItem = Omit<GroceryItemDraft, PortionKey> & { [K in PortionKey]: number | null };
/** An imported plan (with nutrition) or a generated one (without). */
export type DraftPlan = Omit<ProcurementDraft, "items"> & { items: DraftGroceryItem[] };

/** Nutrition for items added by hand, matched back by their position in the request. */
export const GroceryNutritionSchema = z.object({
  items: z.array(z.object({ index: z.number().int().min(0), ...portion })).max(80),
});

export const ProcurementGenerateSchema = z.object({
  days: z.number().int().min(1).max(14),
  people: z.number().int().min(1).max(12),
  budget: z.number().positive().max(100_000).nullable(),
  preferences: z.string().trim().max(500).default(""),
  currency: z.string().regex(/^[A-Z]{3}$/).default("MYR"),
});
export type ProcurementGenerate = z.infer<typeof ProcurementGenerateSchema>;

// Nutrients are unknown for items typed in by hand until they are estimated.
const maybe = z.number().nonnegative().nullable().default(null);

export const GroceryItemSaveSchema = z.object({
  name: z.string().trim().min(1).max(120),
  quantity: z.number().nonnegative().max(100_000),
  unit: z.string().trim().max(30),
  category: z.enum(GROCERY_CATEGORIES),
  estPrice: z.number().nonnegative().max(1_000_000).nullable().default(null),
  store: z.string().trim().max(60).nullable().default(null),
  consumedGrams: maybe,
  kcal: maybe,
  proteinG: maybe,
  carbsG: maybe,
  fatG: maybe,
  fiberG: maybe,
  sugarG: maybe,
  addedSugarG: maybe,
  sodiumMg: maybe,
  gi: z.number().int().min(0).max(110).nullable().default(null),
});
export type GroceryItemSave = z.input<typeof GroceryItemSaveSchema>;

export const ProcurementSaveSchema = z.object({
  title: z.string().trim().min(1).max(80),
  source: z.enum(PROCUREMENT_SOURCES),
  days: z.number().int().min(1).max(31),
  people: z.number().int().min(1).max(12),
  budget: z.number().nonnegative().max(1_000_000).nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  notes: z.string().max(400).nullable(),
  items: z.array(GroceryItemSaveSchema).max(120),
  meals: z.array(PlannedMealSchema).max(60),
});
export type ProcurementSave = z.input<typeof ProcurementSaveSchema>;

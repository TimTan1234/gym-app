import { z } from "zod";

const PlanExerciseSchema = z.object({
  exerciseId: z.string().min(1),
  sets: z.number().int().min(1).max(10),
  repMin: z.number().int().min(1).max(100),
  repMax: z.number().int().min(1).max(100),
  targetRpe: z.number().min(5).max(10).nullable(),
  restSec: z.number().int().min(15).max(600),
  notes: z.string().max(200).nullable(),
});

export const PlanInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  goal: z.string().max(40),
  weeks: z.number().int().min(1).max(52),
  notes: z.string().max(1000).nullable(),
  source: z.enum(["AI", "MANUAL"]),
  days: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(60),
        exercises: z.array(PlanExerciseSchema).min(1, "Each day needs at least one exercise").max(15),
      }),
    )
    .min(1)
    .max(7),
});
export type PlanInput = z.infer<typeof PlanInputSchema>;

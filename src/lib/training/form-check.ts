// Which lifts the camera form check covers, and which library exercises use each.

export const FORM_LIFTS = ["squat", "deadlift", "bench", "press"] as const;
export type FormLift = (typeof FORM_LIFTS)[number];

// Variations whose movement each tracker models; the rest (hack squat, RDL, incline,
// seated machine presses) move differently enough to be judged wrongly.
const BY_SLUG: Record<string, FormLift> = {
  "back-squat": "squat",
  "front-squat": "squat",
  "goblet-squat": "squat",
  "smith-squat": "squat",
  "bodyweight-squat": "squat",
  deadlift: "deadlift",
  "sumo-deadlift": "deadlift",
  "barbell-bench-press": "bench",
  "close-grip-bench-press": "bench",
  "dumbbell-bench-press": "bench",
  "overhead-press": "press",
  "seated-dumbbell-press": "press",
};

export function formLiftFor(slug: string | null | undefined): FormLift | null {
  return (slug && BY_SLUG[slug]) || null;
}

export const isFormLift = (v: unknown): v is FormLift => FORM_LIFTS.includes(v as FormLift);

export const EQUIPMENT_OPTIONS = [
  { value: "barbell", label: "Barbell & rack" },
  { value: "dumbbell", label: "Dumbbells" },
  { value: "machine", label: "Machines" },
  { value: "cable", label: "Cable station" },
  { value: "smith_machine", label: "Smith machine" },
  { value: "kettlebell", label: "Kettlebells" },
  { value: "cardio_machine", label: "Cardio machines" },
] as const;

export const GOAL_LABELS = { CUT: "Lose fat", MAINTAIN: "Maintain", BULK: "Build muscle" } as const;
/** Years of regular training; short enough for a half-width select. */
export const EXPERIENCE_LABELS = { BEGINNER: "Under 1 year", INTERMEDIATE: "1–3 years", ADVANCED: "3+ years" } as const;
export const MEAL_TYPE_LABELS = { BREAKFAST: "Breakfast", LUNCH: "Lunch", DINNER: "Dinner", SNACK: "Snack" } as const;

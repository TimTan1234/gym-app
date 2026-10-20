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
export const EXPERIENCE_LABELS = { BEGINNER: "Beginner (< 1 yr)", INTERMEDIATE: "Intermediate (1–3 yrs)", ADVANCED: "Advanced (3+ yrs)" } as const;
export const MEAL_TYPE_LABELS = { BREAKFAST: "Breakfast", LUNCH: "Lunch", DINNER: "Dinner", SNACK: "Snack" } as const;

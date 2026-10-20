// Stored values; their labels live in i18n messages under labels.* (look up with t(`labels.goal.${v}`) etc.).
export const GOALS = ["CUT", "MAINTAIN", "BULK"] as const;
export const EXPERIENCE_LEVELS = ["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;
export const ACTIVITY_LEVELS = ["SEDENTARY", "LIGHT", "MODERATE", "ACTIVE", "VERY_ACTIVE"] as const;
export const MEAL_TYPES = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"] as const;

/** Profile equipment checklist; labels under labels.equipmentOption.* */
export const EQUIPMENT_OPTIONS = [
  { value: "barbell" },
  { value: "dumbbell" },
  { value: "machine" },
  { value: "cable" },
  { value: "smith_machine" },
  { value: "kettlebell" },
  { value: "cardio_machine" },
] as const;

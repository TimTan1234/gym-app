// Shared enum labels. Keys are the stored values, so look them up with t(`labels.goal.${value}`).
// Muscles, equipment and exercise names are looked up through labelOf()/exerciseName() in i18n/labels.ts.
export const en = {
  mealType: { BREAKFAST: "Breakfast", LUNCH: "Lunch", DINNER: "Dinner", SNACK: "Snack" },
  goal: { CUT: "Lose fat", MAINTAIN: "Maintain", BULK: "Build muscle" },
  experience: { BEGINNER: "Under 1 year", INTERMEDIATE: "1–3 years", ADVANCED: "3+ years" },
  activity: {
    SEDENTARY: "Sedentary (desk job, little exercise)",
    LIGHT: "Light (1–3 workouts/week)",
    MODERATE: "Moderate (3–5 workouts/week)",
    ACTIVE: "Active (6–7 workouts/week)",
    VERY_ACTIVE: "Very active (physical job + training)",
  },
  sex: { MALE: "Male", FEMALE: "Female" },
  units: { METRIC: "Metric (kg)", IMPERIAL: "Imperial (lb)" },
  /** Profile equipment checklist (values match Profile.equipment). */
  equipmentOption: {
    barbell: "Barbell & rack",
    dumbbell: "Dumbbells",
    machine: "Machines",
    cable: "Cable station",
    smith_machine: "Smith machine",
    kettlebell: "Kettlebells",
    cardio_machine: "Cardio machines",
  },
  record: { MAX_WEIGHT: "Heaviest weight", EST_1RM: "Estimated 1RM", MAX_VOLUME_SET: "Best set volume" },
  // Filled in by the exercise-name pass: muscle, equipment and exercise (by slug).
  muscle: {} as Record<string, string>,
  equipment: {} as Record<string, string>,
  exercise: {} as Record<string, string>,
};

export const zh: typeof en = {
  mealType: { BREAKFAST: "早餐", LUNCH: "午餐", DINNER: "晚餐", SNACK: "加餐" },
  goal: { CUT: "减脂", MAINTAIN: "保持", BULK: "增肌" },
  experience: { BEGINNER: "不到 1 年", INTERMEDIATE: "1–3 年", ADVANCED: "3 年以上" },
  activity: {
    SEDENTARY: "久坐（办公室工作，很少运动）",
    LIGHT: "轻度（每周 1–3 次训练）",
    MODERATE: "中度（每周 3–5 次训练）",
    ACTIVE: "活跃（每周 6–7 次训练）",
    VERY_ACTIVE: "非常活跃（体力劳动＋训练）",
  },
  sex: { MALE: "男", FEMALE: "女" },
  units: { METRIC: "公制（kg）", IMPERIAL: "英制（lb）" },
  equipmentOption: {
    barbell: "杠铃和深蹲架",
    dumbbell: "哑铃",
    machine: "固定器械",
    cable: "龙门架／绳索",
    smith_machine: "史密斯机",
    kettlebell: "壶铃",
    cardio_machine: "有氧器械",
  },
  record: { MAX_WEIGHT: "最大重量", EST_1RM: "估算 1RM", MAX_VOLUME_SET: "单组最大容量" },
  muscle: {},
  equipment: {},
  exercise: {},
};

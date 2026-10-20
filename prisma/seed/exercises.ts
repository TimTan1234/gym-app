// Global exercise library. Slugs are stable identifiers that the AI plan
// generator is constrained to — never rename a slug once released.

export type SeedExercise = {
  slug: string;
  name: string;
  primaryMuscle: string;
  secondaryMuscles: string[];
  equipment: string;
  category: "COMPOUND" | "ISOLATION" | "CARDIO";
  isLowerBody: boolean;
};

type Row = [slug: string, name: string, primary: string, secondary: string[], equipment: string, category: SeedExercise["category"]];

const LOWER = new Set(["quads", "hamstrings", "glutes", "calves", "adductors"]);

const rows: Row[] = [
  // Chest
  ["barbell-bench-press", "Barbell Bench Press", "chest", ["triceps", "shoulders"], "barbell", "COMPOUND"],
  ["incline-barbell-bench-press", "Incline Barbell Bench Press", "chest", ["shoulders", "triceps"], "barbell", "COMPOUND"],
  ["decline-barbell-bench-press", "Decline Barbell Bench Press", "chest", ["triceps"], "barbell", "COMPOUND"],
  ["dumbbell-bench-press", "Dumbbell Bench Press", "chest", ["triceps", "shoulders"], "dumbbell", "COMPOUND"],
  ["incline-dumbbell-press", "Incline Dumbbell Press", "chest", ["shoulders", "triceps"], "dumbbell", "COMPOUND"],
  ["machine-chest-press", "Machine Chest Press", "chest", ["triceps"], "machine", "COMPOUND"],
  ["smith-incline-press", "Smith Machine Incline Press", "chest", ["shoulders", "triceps"], "smith_machine", "COMPOUND"],
  ["push-up", "Push-Up", "chest", ["triceps", "shoulders", "abs"], "bodyweight", "COMPOUND"],
  ["chest-dip", "Chest Dip", "chest", ["triceps", "shoulders"], "bodyweight", "COMPOUND"],
  ["dumbbell-fly", "Dumbbell Fly", "chest", [], "dumbbell", "ISOLATION"],
  ["cable-crossover", "Cable Crossover", "chest", [], "cable", "ISOLATION"],
  ["pec-deck", "Pec Deck", "chest", [], "machine", "ISOLATION"],
  ["low-to-high-cable-fly", "Low-to-High Cable Fly", "chest", ["shoulders"], "cable", "ISOLATION"],

  // Back
  ["deadlift", "Deadlift", "back", ["hamstrings", "glutes", "traps", "forearms"], "barbell", "COMPOUND"],
  ["barbell-row", "Barbell Row", "back", ["biceps", "traps"], "barbell", "COMPOUND"],
  ["pendlay-row", "Pendlay Row", "back", ["biceps", "traps"], "barbell", "COMPOUND"],
  ["dumbbell-row", "One-Arm Dumbbell Row", "back", ["biceps"], "dumbbell", "COMPOUND"],
  ["chest-supported-row", "Chest-Supported Dumbbell Row", "back", ["biceps"], "dumbbell", "COMPOUND"],
  ["seated-cable-row", "Seated Cable Row", "back", ["biceps"], "cable", "COMPOUND"],
  ["t-bar-row", "T-Bar Row", "back", ["biceps", "traps"], "machine", "COMPOUND"],
  ["machine-row", "Machine Row", "back", ["biceps"], "machine", "COMPOUND"],
  ["pull-up", "Pull-Up", "back", ["biceps"], "bodyweight", "COMPOUND"],
  ["chin-up", "Chin-Up", "back", ["biceps"], "bodyweight", "COMPOUND"],
  ["assisted-pull-up", "Assisted Pull-Up", "back", ["biceps"], "machine", "COMPOUND"],
  ["lat-pulldown", "Lat Pulldown", "back", ["biceps"], "cable", "COMPOUND"],
  ["close-grip-lat-pulldown", "Close-Grip Lat Pulldown", "back", ["biceps"], "cable", "COMPOUND"],
  ["straight-arm-pulldown", "Straight-Arm Pulldown", "back", [], "cable", "ISOLATION"],
  ["inverted-row", "Inverted Row", "back", ["biceps"], "bodyweight", "COMPOUND"],
  ["back-extension", "Back Extension", "back", ["glutes", "hamstrings"], "bodyweight", "ISOLATION"],
  ["rack-pull", "Rack Pull", "back", ["traps", "glutes"], "barbell", "COMPOUND"],

  // Shoulders
  ["overhead-press", "Overhead Press", "shoulders", ["triceps"], "barbell", "COMPOUND"],
  ["seated-dumbbell-press", "Seated Dumbbell Shoulder Press", "shoulders", ["triceps"], "dumbbell", "COMPOUND"],
  ["arnold-press", "Arnold Press", "shoulders", ["triceps"], "dumbbell", "COMPOUND"],
  ["machine-shoulder-press", "Machine Shoulder Press", "shoulders", ["triceps"], "machine", "COMPOUND"],
  ["landmine-press", "Landmine Press", "shoulders", ["chest", "triceps"], "barbell", "COMPOUND"],
  ["dumbbell-lateral-raise", "Dumbbell Lateral Raise", "shoulders", [], "dumbbell", "ISOLATION"],
  ["cable-lateral-raise", "Cable Lateral Raise", "shoulders", [], "cable", "ISOLATION"],
  ["machine-lateral-raise", "Machine Lateral Raise", "shoulders", [], "machine", "ISOLATION"],
  ["front-raise", "Dumbbell Front Raise", "shoulders", [], "dumbbell", "ISOLATION"],
  ["rear-delt-fly", "Rear Delt Dumbbell Fly", "shoulders", ["back"], "dumbbell", "ISOLATION"],
  ["reverse-pec-deck", "Reverse Pec Deck", "shoulders", ["back"], "machine", "ISOLATION"],
  ["face-pull", "Face Pull", "shoulders", ["back", "traps"], "cable", "ISOLATION"],
  ["upright-row", "Upright Row", "shoulders", ["traps"], "barbell", "COMPOUND"],

  // Traps
  ["barbell-shrug", "Barbell Shrug", "traps", ["forearms"], "barbell", "ISOLATION"],
  ["dumbbell-shrug", "Dumbbell Shrug", "traps", ["forearms"], "dumbbell", "ISOLATION"],

  // Biceps
  ["barbell-curl", "Barbell Curl", "biceps", ["forearms"], "barbell", "ISOLATION"],
  ["ez-bar-curl", "EZ-Bar Curl", "biceps", ["forearms"], "barbell", "ISOLATION"],
  ["dumbbell-curl", "Dumbbell Curl", "biceps", ["forearms"], "dumbbell", "ISOLATION"],
  ["hammer-curl", "Hammer Curl", "biceps", ["forearms"], "dumbbell", "ISOLATION"],
  ["incline-dumbbell-curl", "Incline Dumbbell Curl", "biceps", [], "dumbbell", "ISOLATION"],
  ["preacher-curl", "Preacher Curl", "biceps", [], "machine", "ISOLATION"],
  ["cable-curl", "Cable Curl", "biceps", ["forearms"], "cable", "ISOLATION"],
  ["concentration-curl", "Concentration Curl", "biceps", [], "dumbbell", "ISOLATION"],

  // Triceps
  ["close-grip-bench-press", "Close-Grip Bench Press", "triceps", ["chest", "shoulders"], "barbell", "COMPOUND"],
  ["triceps-dip", "Triceps Dip", "triceps", ["chest", "shoulders"], "bodyweight", "COMPOUND"],
  ["skull-crusher", "Skull Crusher", "triceps", [], "barbell", "ISOLATION"],
  ["triceps-pushdown", "Cable Triceps Pushdown", "triceps", [], "cable", "ISOLATION"],
  ["rope-pushdown", "Rope Pushdown", "triceps", [], "cable", "ISOLATION"],
  ["overhead-cable-extension", "Overhead Cable Triceps Extension", "triceps", [], "cable", "ISOLATION"],
  ["overhead-dumbbell-extension", "Overhead Dumbbell Triceps Extension", "triceps", [], "dumbbell", "ISOLATION"],
  ["dumbbell-kickback", "Dumbbell Kickback", "triceps", [], "dumbbell", "ISOLATION"],

  // Forearms
  ["wrist-curl", "Wrist Curl", "forearms", [], "dumbbell", "ISOLATION"],
  ["farmers-walk", "Farmer's Walk", "forearms", ["traps", "abs"], "dumbbell", "COMPOUND"],

  // Quads
  ["back-squat", "Barbell Back Squat", "quads", ["glutes", "hamstrings", "abs"], "barbell", "COMPOUND"],
  ["front-squat", "Front Squat", "quads", ["glutes", "abs"], "barbell", "COMPOUND"],
  ["goblet-squat", "Goblet Squat", "quads", ["glutes"], "dumbbell", "COMPOUND"],
  ["hack-squat", "Hack Squat", "quads", ["glutes"], "machine", "COMPOUND"],
  ["smith-squat", "Smith Machine Squat", "quads", ["glutes"], "smith_machine", "COMPOUND"],
  ["leg-press", "Leg Press", "quads", ["glutes"], "machine", "COMPOUND"],
  ["bulgarian-split-squat", "Bulgarian Split Squat", "quads", ["glutes"], "dumbbell", "COMPOUND"],
  ["walking-lunge", "Walking Lunge", "quads", ["glutes", "hamstrings"], "dumbbell", "COMPOUND"],
  ["reverse-lunge", "Reverse Lunge", "quads", ["glutes"], "dumbbell", "COMPOUND"],
  ["step-up", "Step-Up", "quads", ["glutes"], "dumbbell", "COMPOUND"],
  ["leg-extension", "Leg Extension", "quads", [], "machine", "ISOLATION"],
  ["bodyweight-squat", "Bodyweight Squat", "quads", ["glutes"], "bodyweight", "COMPOUND"],

  // Hamstrings
  ["romanian-deadlift", "Romanian Deadlift", "hamstrings", ["glutes", "back"], "barbell", "COMPOUND"],
  ["dumbbell-romanian-deadlift", "Dumbbell Romanian Deadlift", "hamstrings", ["glutes"], "dumbbell", "COMPOUND"],
  ["stiff-leg-deadlift", "Stiff-Leg Deadlift", "hamstrings", ["glutes", "back"], "barbell", "COMPOUND"],
  ["good-morning", "Good Morning", "hamstrings", ["glutes", "back"], "barbell", "COMPOUND"],
  ["lying-leg-curl", "Lying Leg Curl", "hamstrings", [], "machine", "ISOLATION"],
  ["seated-leg-curl", "Seated Leg Curl", "hamstrings", [], "machine", "ISOLATION"],
  ["nordic-curl", "Nordic Hamstring Curl", "hamstrings", [], "bodyweight", "ISOLATION"],

  // Glutes
  ["hip-thrust", "Barbell Hip Thrust", "glutes", ["hamstrings"], "barbell", "COMPOUND"],
  ["glute-bridge", "Glute Bridge", "glutes", ["hamstrings"], "bodyweight", "ISOLATION"],
  ["cable-kickback", "Cable Glute Kickback", "glutes", [], "cable", "ISOLATION"],
  ["hip-abduction-machine", "Hip Abduction Machine", "glutes", [], "machine", "ISOLATION"],
  ["sumo-deadlift", "Sumo Deadlift", "glutes", ["quads", "hamstrings", "back", "adductors"], "barbell", "COMPOUND"],
  ["kettlebell-swing", "Kettlebell Swing", "glutes", ["hamstrings", "back"], "kettlebell", "COMPOUND"],

  // Adductors / calves
  ["hip-adduction-machine", "Hip Adduction Machine", "adductors", [], "machine", "ISOLATION"],
  ["standing-calf-raise", "Standing Calf Raise", "calves", [], "machine", "ISOLATION"],
  ["seated-calf-raise", "Seated Calf Raise", "calves", [], "machine", "ISOLATION"],
  ["leg-press-calf-raise", "Leg Press Calf Raise", "calves", [], "machine", "ISOLATION"],

  // Core
  ["plank", "Plank", "abs", [], "bodyweight", "ISOLATION"],
  ["side-plank", "Side Plank", "abs", [], "bodyweight", "ISOLATION"],
  ["hanging-leg-raise", "Hanging Leg Raise", "abs", ["forearms"], "bodyweight", "ISOLATION"],
  ["cable-crunch", "Cable Crunch", "abs", [], "cable", "ISOLATION"],
  ["crunch", "Crunch", "abs", [], "bodyweight", "ISOLATION"],
  ["ab-wheel-rollout", "Ab Wheel Rollout", "abs", ["back"], "bodyweight", "ISOLATION"],
  ["russian-twist", "Russian Twist", "abs", [], "bodyweight", "ISOLATION"],
  ["pallof-press", "Pallof Press", "abs", [], "cable", "ISOLATION"],
  ["dead-bug", "Dead Bug", "abs", [], "bodyweight", "ISOLATION"],

  // Full body / conditioning
  ["power-clean", "Power Clean", "full_body", ["traps", "quads", "glutes"], "barbell", "COMPOUND"],
  ["thruster", "Dumbbell Thruster", "full_body", ["quads", "shoulders"], "dumbbell", "COMPOUND"],
  ["burpee", "Burpee", "full_body", ["chest", "quads"], "bodyweight", "CARDIO"],

  // Cardio
  ["treadmill-run", "Treadmill Run", "cardio", [], "cardio_machine", "CARDIO"],
  ["incline-walk", "Incline Treadmill Walk", "cardio", [], "cardio_machine", "CARDIO"],
  ["stationary-bike", "Stationary Bike", "cardio", [], "cardio_machine", "CARDIO"],
  ["rowing-machine", "Rowing Machine", "cardio", ["back"], "cardio_machine", "CARDIO"],
  ["elliptical", "Elliptical", "cardio", [], "cardio_machine", "CARDIO"],
  ["stair-climber", "Stair Climber", "cardio", ["glutes"], "cardio_machine", "CARDIO"],
  ["jump-rope", "Jump Rope", "cardio", ["calves"], "bodyweight", "CARDIO"],
];

export const EXERCISES: SeedExercise[] = rows.map(([slug, name, primaryMuscle, secondaryMuscles, equipment, category]) => ({
  slug,
  name,
  primaryMuscle,
  secondaryMuscles,
  equipment,
  category,
  isLowerBody: LOWER.has(primaryMuscle) || slug.includes("deadlift"),
}));

export const MUSCLES = [...new Set(EXERCISES.map((e) => e.primaryMuscle))];
export const EQUIPMENT = [...new Set(EXERCISES.map((e) => e.equipment))];

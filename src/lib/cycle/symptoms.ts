// Symptom, flow and mood values shared by the cycle log, its insights and the Luna import.

export const BUILT_IN_SYMPTOMS = ["CRAMPS", "BLOATING", "HEADACHE", "FATIGUE", "HAPPY", "ANXIOUS", "ACNE", "TENDER_BREASTS"] as const;
export type BuiltInSymptom = (typeof BUILT_IN_SYMPTOMS)[number];

export const SEVERITIES = ["MILD", "MODERATE", "SEVERE"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const FLOWS = ["SPOTTING", "LIGHT", "MEDIUM", "HEAVY"] as const;
export type FlowValue = (typeof FLOWS)[number];

export const MOODS = ["VERY_LOW", "LOW", "NEUTRAL", "GOOD", "GREAT"] as const;
export type MoodValue = (typeof MOODS)[number];

/** A symptom on a logged day. `name` is a built-in key or a custom symptom as the user typed it. */
export type SymptomEntry = {
  name: string;
  severity: Severity;
};

export const MAX_CUSTOM_SYMPTOM_CHARS = 30;

export function isBuiltInSymptom(name: string): name is BuiltInSymptom {
  return (BUILT_IN_SYMPTOMS as readonly string[]).includes(name);
}

export const SEVERITY_RANK: Record<Severity, number> = { MILD: 1, MODERATE: 2, SEVERE: 3 };
export const FLOW_RANK: Record<FlowValue, number> = { SPOTTING: 1, LIGHT: 2, MEDIUM: 3, HEAVY: 4 };

/** The stored JSON column, read defensively: anything that isn't a symptom entry is dropped. */
export function readSymptoms(value: unknown): SymptomEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((s) =>
    s && typeof s === "object" && typeof s.name === "string" && (SEVERITIES as readonly string[]).includes(s.severity)
      ? [{ name: s.name, severity: s.severity as Severity }]
      : [],
  );
}

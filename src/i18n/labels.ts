// Labels for values stored in the database (muscles, equipment, exercise names).
import { label as titleCase } from "@/lib/format";
import type { MessageKey, T } from "./translate";

/** "smith_machine" → "Smith Machine" in English, the translated label in other languages. */
export function labelOf(t: T, group: "muscle" | "equipment", value: string): string {
  const key = `labels.${group}.${value}`;
  const out = t(key as MessageKey);
  return out === key ? titleCase(value) : out;
}

/** Library exercises are translated by slug; custom exercises keep the name the user gave them. */
export function exerciseName(t: T, exercise: { slug: string; name: string }): string {
  if (t.locale === "en") return exercise.name;
  const key = `labels.exercise.${exercise.slug}`;
  const out = t(key as MessageKey);
  return out === key ? exercise.name : out;
}

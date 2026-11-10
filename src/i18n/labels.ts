// Labels for values stored in the database (muscles, equipment, exercise names).
import { label as titleCase } from "@/lib/format";
import { displayDistance, distanceUnit, round, type UnitSystem } from "@/lib/units";
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

/** A cardio set as "25 min / 5.2 km"; the distance is left out when none was logged. */
export function cardioSetText(t: T, set: { durationSec: number | null; distanceM: number | null }, units: UnitSystem): string {
  const time = t("train.minutesShort", { n: round((set.durationSec ?? 0) / 60, 1) });
  return set.distanceM ? `${time} / ${displayDistance(set.distanceM, units)} ${distanceUnit(units)}` : time;
}

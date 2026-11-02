"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { useT } from "@/i18n/client";
import { exerciseName, labelOf } from "@/i18n/labels";
import { Input, Select } from "@/components/ui";

export interface PickerExercise {
  id: string;
  /** Library slug, used to show the translated name; omit for custom exercises. */
  slug?: string;
  name: string;
  primaryMuscle: string;
  equipment: string;
  isLowerBody: boolean;
  /** COMPOUND, ISOLATION or CARDIO; lets swap suggestions offer the same kind of lift. */
  category?: string;
}


export function ExercisePicker({
  exercises,
  onPick,
  onClose,
  title,
  initialMuscle = "",
  suggested = [],
}: {
  exercises: PickerExercise[];
  onPick: (ex: PickerExercise) => void;
  onClose: () => void;
  /** Defaults to "Add exercise". */
  title?: string;
  /** Start filtered to this muscle, e.g. the one being swapped. */
  initialMuscle?: string;
  /** Shown first while nothing is typed, e.g. swaps that fit the user's equipment. */
  suggested?: PickerExercise[];
}) {
  const t = useT();
  const heading = title ?? t("train.addExercise");
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState(initialMuscle);
  const muscles = useMemo(() => [...new Set(exercises.map((e) => e.primaryMuscle))].sort(), [exercises]);
  const nameOf = (e: PickerExercise) => exerciseName(t, { slug: e.slug ?? "", name: e.name });
  const query = q.trim().toLowerCase();
  // Match the English name too, so either language finds the exercise.
  const filtered = exercises.filter(
    (e) => (!muscle || e.primaryMuscle === muscle) && (e.name.toLowerCase().includes(query) || nameOf(e).toLowerCase().includes(query)),
  );
  const lower = (s: string) => (t.locale === "en" ? s.toLowerCase() : s);
  const showSuggested = suggested.length > 0 && !query;
  const rest = showSuggested ? filtered.filter((e) => !suggested.some((s) => s.id === e.id)) : filtered;
  const row = (e: PickerExercise) => (
    <li key={e.id}>
      <button type="button" onClick={() => onPick(e)} className="flex w-full items-center justify-between rounded-field px-3 py-2.5 text-left hover:bg-wash">
        <span className="font-medium">{nameOf(e)}</span>
        <span className="text-xs text-steel">
          {labelOf(t, "muscle", e.primaryMuscle)}
          {t.locale === "zh" ? "，" : ", "}
          {lower(labelOf(t, "equipment", e.equipment))}
        </span>
      </button>
    </li>
  );

  return (
    <div role="dialog" aria-modal="true" aria-label={heading} className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <div className="flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-[14px] bg-paper p-4 sm:rounded-card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="display text-[22px]">{heading}</h2>
          <button type="button" aria-label={t("train.close")} onClick={onClose} className="rounded-field p-2 text-steel hover:bg-wash">
            <X className="size-5" />
          </button>
        </div>
        <div className="mb-3 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-steel" />
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("train.search")} className="pl-9" aria-label={t("train.searchExercises")} />
          </div>
          <Select value={muscle} onChange={(e) => setMuscle(e.target.value)} className="w-36" aria-label={t("train.filterMuscle")}>
            <option value="">{t("train.allMuscles")}</option>
            {muscles.map((m) => (
              <option key={m} value={m}>{labelOf(t, "muscle", m)}</option>
            ))}
          </Select>
        </div>
        <div className="-mx-2 flex-1 overflow-y-auto">
          {showSuggested && (
            <section aria-labelledby="picker-suggested" className="mb-2 border-b border-line pb-2">
              <h3 id="picker-suggested" className="px-3 pb-1 text-[13px] font-medium text-steel">{t("train.suggestedSwaps")}</h3>
              <ul>{suggested.map(row)}</ul>
            </section>
          )}
          {showSuggested && rest.length > 0 && <h3 className="px-3 pb-1 text-[13px] font-medium text-steel">{t("train.moreExercises")}</h3>}
          <ul>
            {rest.map(row)}
            {filtered.length === 0 && <li className="px-3 py-6 text-center text-sm text-steel">{t("train.noExercisesFound")}</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}

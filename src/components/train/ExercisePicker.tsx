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
}


export function ExercisePicker({
  exercises,
  onPick,
  onClose,
}: {
  exercises: PickerExercise[];
  onPick: (ex: PickerExercise) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState("");
  const muscles = useMemo(() => [...new Set(exercises.map((e) => e.primaryMuscle))].sort(), [exercises]);
  const nameOf = (e: PickerExercise) => exerciseName(t, { slug: e.slug ?? "", name: e.name });
  const query = q.trim().toLowerCase();
  // Match the English name too, so either language finds the exercise.
  const filtered = exercises.filter(
    (e) => (!muscle || e.primaryMuscle === muscle) && (e.name.toLowerCase().includes(query) || nameOf(e).toLowerCase().includes(query)),
  );
  const lower = (s: string) => (t.locale === "en" ? s.toLowerCase() : s);

  return (
    <div role="dialog" aria-modal="true" aria-label={t("train.addExercise")} className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <div className="flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-[14px] bg-paper p-4 sm:rounded-card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="display text-[22px]">{t("train.addExercise")}</h2>
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
        <ul className="-mx-2 flex-1 overflow-y-auto">
          {filtered.map((e) => (
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
          ))}
          {filtered.length === 0 && <li className="px-3 py-6 text-center text-sm text-steel">{t("train.noExercisesFound")}</li>}
        </ul>
      </div>
    </div>
  );
}

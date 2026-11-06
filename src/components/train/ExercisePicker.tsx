"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Loader2, Search, Sparkles, X } from "lucide-react";
import { resizeImage } from "@/lib/image";
import { useT } from "@/i18n/client";
import { exerciseName, labelOf } from "@/i18n/labels";
import { Button, Input, Select } from "@/components/ui";

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

/** What the AI made of a photo or description of equipment. */
interface Identified {
  equipment: string | null;
  exerciseIds: string[];
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
  const cameraRef = useRef<HTMLInputElement>(null);
  const [identifying, setIdentifying] = useState(false);
  const [identified, setIdentified] = useState<Identified | null>(null);
  // The photo being identified, shown beside the answer so it's clear what was looked at.
  const [photo, setPhoto] = useState<string | null>(null);
  const muscles = useMemo(() => [...new Set(exercises.map((e) => e.primaryMuscle))].sort(), [exercises]);
  const nameOf = (e: PickerExercise) => exerciseName(t, { slug: e.slug ?? "", name: e.name });
  const query = q.trim().toLowerCase();
  // Match the English name too, so either language finds the exercise.
  const filtered = exercises.filter(
    (e) => (!muscle || e.primaryMuscle === muscle) && (e.name.toLowerCase().includes(query) || nameOf(e).toLowerCase().includes(query)),
  );
  const lower = (s: string) => (t.locale === "en" ? s.toLowerCase() : s);
  const showSuggested = suggested.length > 0 && !query;
  // Only exercises this picker offers: a swap leaves out the one being swapped.
  const matches = identified ? identified.exerciseIds.map((id) => exercises.find((e) => e.id === id)).filter((e): e is PickerExercise => !!e) : [];

  async function identify(input: { image?: string; text?: string }) {
    setPhoto(input.image ?? null);
    setIdentifying(true);
    setIdentified(null);
    try {
      const res = await fetch("/api/ai/exercise", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      const data = (await res.json()) as Identified & { error?: string };
      if (!res.ok) throw new Error(data.error ?? t("train.identify.failed"));
      setIdentified({ equipment: data.equipment, exerciseIds: data.exerciseIds });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("train.identify.failed"));
    } finally {
      setIdentifying(false);
    }
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    let image: string;
    try {
      image = await resizeImage(file);
    } catch {
      return void toast.error(t("nutrition.imageReadError"));
    }
    await identify({ image });
  }
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
    <div role="dialog" aria-modal="true" aria-label={heading} onKeyDown={(e) => e.key === "Escape" && onClose()} className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <div className="flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-[14px] bg-paper p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-card">
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
        {/* Knows the machine, not the exercise: a photo of it finds the exercises done on it. */}
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhoto} data-testid="identify-photo-input" />
        <Button variant="secondary" className="mb-3 shrink-0 self-start" onClick={() => cameraRef.current?.click()} disabled={identifying}>
          <Camera className="size-4" aria-hidden /> {t("train.identify.photo")}
        </Button>
        <div className="-mx-2 flex-1 overflow-y-auto">
          {(identifying || identified) && (
            <section aria-labelledby="picker-identified" aria-busy={identifying} className="mb-2 border-b border-line pb-2">
              <div className="flex items-center gap-3 px-3 pb-2">
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local data URL preview
                  <img src={photo} alt="" className="size-12 shrink-0 rounded-field bg-wash object-cover" />
                ) : (
                  <span className="grid size-12 shrink-0 place-items-center rounded-field bg-wash text-steel">
                    <Sparkles className="size-5" aria-hidden />
                  </span>
                )}
                <h3 id="picker-identified" className="min-w-0 flex-1">
                  {identifying ? (
                    <span role="status" className="flex items-center gap-2 text-sm text-steel">
                      <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> {t("train.identify.working")}
                    </span>
                  ) : (
                    <>
                      <span className="block text-[13px] text-steel">{t("train.identify.looksLike")}</span>
                      <span className="block font-medium">{identified?.equipment ?? t("train.identify.matches")}</span>
                    </>
                  )}
                </h3>
                {identified && (
                  <button type="button" aria-label={t("train.identify.clear")} onClick={() => (setIdentified(null), setPhoto(null))} className="-mr-1 grid size-11 shrink-0 place-items-center rounded-full text-steel hover:bg-wash">
                    <X className="size-4" />
                  </button>
                )}
              </div>
              {identified && (matches.length > 0 ? <ul>{matches.map(row)}</ul> : <p className="px-3 pb-2 text-sm text-steel">{t("train.identify.noMatch")}</p>)}
            </section>
          )}
          {showSuggested && (
            <section aria-labelledby="picker-suggested" className="mb-2 border-b border-line pb-2">
              <h3 id="picker-suggested" className="px-3 pb-1 text-[13px] font-medium text-steel">{t("train.suggestedSwaps")}</h3>
              <ul>{suggested.map(row)}</ul>
            </section>
          )}
          {showSuggested && rest.length > 0 && <h3 className="px-3 pb-1 text-[13px] font-medium text-steel">{t("train.moreExercises")}</h3>}
          <ul>
            {rest.map(row)}
            {filtered.length === 0 && !identified && (
              <li className="flex flex-col items-center gap-2 px-3 py-6 text-center text-sm text-steel">
                {t("train.noExercisesFound")}
                {/* Not a name in the list: maybe a description of the equipment, which the AI can place. */}
                {query && (
                  <Button variant="secondary" className="h-auto min-h-11 whitespace-normal py-2" onClick={() => identify({ text: q.trim() })} disabled={identifying}>
                    <Sparkles className="size-4" aria-hidden /> {t("train.identify.ask", { q: q.trim() })}
                  </Button>
                )}
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

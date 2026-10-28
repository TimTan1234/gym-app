"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { History, Loader2, Plus, ScanBarcode, Sparkles, Star, Trash2, X } from "lucide-react";
import dynamic from "next/dynamic";
import { deleteSavedFood, saveMeal, markSavedFoodsUsed, updateMeal } from "@/server/nutrition";
import { scaleItem, sumNutrients } from "@/lib/nutrition/totals";
import { MAX_MEAL_PHOTOS, type MealAnalysis } from "@/lib/ai/schemas";
import { Button, Card, IconButton, Input, Textarea, cn } from "@/components/ui";
import { MacroLine } from "@/components/MacroLine";
import { HIGH_SUGAR_MEAL_G, SugarTag } from "./Sugar";
import { MealPhotos } from "./MealPhotos";
import { CarbBudgetLine, GiTag } from "./CarbBudget";
import { budgetFor, type CarbBudget } from "@/lib/nutrition/diabetes";
import { useClientValue } from "@/lib/use-client";
import { resizeImage } from "@/lib/image";
import type { BarcodeItem } from "@/lib/nutrition/barcode";
import { useT } from "@/i18n/client";

// The scanner pulls in a WebAssembly decoder on browsers without one, so load it on demand.
const BarcodeScanner = dynamic(() => import("./BarcodeScanner").then((m) => m.BarcodeScanner), { ssr: false });

const MEAL_TYPES = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"] as const;
type MealType = (typeof MEAL_TYPES)[number];
type Source = "AI_TEXT" | "AI_PHOTO" | "MANUAL";

export interface DraftItem {
  key: string;
  name: string;
  quantity: number;
  unit: string;
  grams: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  sugarG: number;
  addedSugarG: number;
  sodiumMg: number;
  /** Glycaemic index of the food; not scaled with grams. */
  gi: number | null;
  confidence: number | null;
  assumptions: string | null;
  savedFoodId?: string;
  /** Reference values that gram changes scale from (avoids compounding rounding). */
  base?: BaseValues;
}

type BaseValues = Pick<DraftItem, "grams" | "kcal" | "proteinG" | "carbsG" | "fatG" | "fiberG" | "sugarG" | "addedSugarG" | "sodiumMg">;

function baseOf(i: DraftItem): BaseValues {
  const { grams, kcal, proteinG, carbsG, fatG, fiberG, sugarG, addedSugarG, sodiumMg } = i;
  return { grams, kcal, proteinG, carbsG, fatG, fiberG, sugarG, addedSugarG, sodiumMg };
}

type ItemValues = Omit<DraftItem, "key" | "confidence" | "assumptions" | "savedFoodId" | "base">;

export interface SavedFoodOption extends ItemValues {
  id: string;
}

/** A logged meal opened for editing: the draft starts from its items. */
export interface EditableMeal {
  id: string;
  mealType: MealType;
  description: string;
  source: Source;
  notes: string | null;
  items: (ItemValues & { confidence: number | null; assumptions: string | null })[];
}

export interface RecentMealOption {
  id: string;
  description: string;
  mealType: MealType;
  kcal: number;
  items: ItemValues[];
}

function guessMealType(): MealType {
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  if (h < 10.5) return "BREAKFAST";
  if (h < 15) return "LUNCH";
  if (h >= 17.5 && h < 21.5) return "DINNER";
  return "SNACK";
}

let keySeq = 0;
const newKey = () => `i${++keySeq}`;

const emptyItem = (): DraftItem => ({
  key: newKey(),
  name: "",
  quantity: 1,
  unit: "serving",
  grams: 100,
  kcal: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
  fiberG: 0,
  sugarG: 0,
  addedSugarG: 0,
  sodiumMg: 0,
  gi: null,
  confidence: null,
  assumptions: null,
});

export function MealLogger({
  date,
  isToday,
  initialType,
  savedFoods,
  recentMeals,
  editing = null,
  eatenTime: initialTime = null,
  carbBudget = null,
  initialText = "",
}: {
  date: string;
  isToday: boolean;
  initialType: MealType | null;
  savedFoods: SavedFoodOption[];
  recentMeals: RecentMealOption[];
  editing?: EditableMeal | null;
  /** Diabetes mode: ask when the meal was eaten ("HH:MM"), starting from this. */
  eatenTime?: string | null;
  /** Diabetes mode: the CPG carb budget, shown against the draft, and GI per item. */
  carbBudget?: CarbBudget | null;
  /** Description to start from, e.g. a meal from a grocery plan. */
  initialText?: string;
}) {
  const t = useT();
  const router = useRouter();
  const guessedType = useClientValue(guessMealType, "LUNCH");
  const [chosenType, setMealType] = useState<MealType | null>(editing?.mealType ?? initialType);
  const mealType = chosenType ?? guessedType;
  const [text, setText] = useState(initialText);
  const [images, setImages] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [items, setItems] = useState<DraftItem[]>(() => editing?.items.map((i) => ({ ...i, key: newKey() })) ?? []);
  const [title, setTitle] = useState(editing?.description ?? "");
  const [notes, setNotes] = useState<string | null>(editing?.notes ?? null);
  const [source, setSource] = useState<Source>(editing?.source ?? "MANUAL");
  const [eatenTime, setEatenTime] = useState(initialTime);
  const [saving, startSaving] = useTransition();
  const [editingSaved, setEditingSaved] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [removing, startRemoving] = useTransition();

  /** Adds the picked photos (camera: one; gallery: several), up to MAX_MEAL_PHOTOS in all. */
  async function onPickImages(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    const room = MAX_MEAL_PHOTOS - images.length;
    if (files.length > room) toast.error(t("nutrition.tooManyPhotos", { max: MAX_MEAL_PHOTOS }));
    const added: string[] = [];
    for (const file of files.slice(0, Math.max(0, room))) {
      try {
        added.push(await resizeImage(file));
      } catch {
        toast.error(t("nutrition.imageReadError"));
      }
    }
    if (added.length) setImages((cur) => [...cur, ...added].slice(0, MAX_MEAL_PHOTOS));
  }

  async function analyze() {
    if (!text.trim() && images.length === 0) {
      toast.error(t("nutrition.describeFirst"));
      return;
    }
    setAnalyzing(true);
    try {
      const res = await fetch("/api/ai/meal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() || undefined, images: images.length ? images : undefined }),
      });
      const data = (await res.json()) as { analysis?: MealAnalysis; error?: string };
      if (!res.ok || !data.analysis) throw new Error(data.error ?? t("nutrition.analysisFailed"));
      const a = data.analysis;
      setItems((cur) => [...cur, ...a.items.map((i) => ({ ...i, key: newKey() }))]);
      setTitle((cur) => cur || a.title);
      setNotes(a.notes);
      setSource(images.length ? "AI_PHOTO" : "AI_TEXT");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("nutrition.analysisFailed"));
    } finally {
      setAnalyzing(false);
    }
  }

  function update(key: string, patch: Partial<DraftItem>) {
    setItems((cur) =>
      cur.map((i) => {
        if (i.key !== key) return i;
        const next = { ...i, ...patch };
        // Added sugar is part of total sugar: keep the pair consistent with whichever was typed.
        if (patch.addedSugarG !== undefined) next.sugarG = Math.max(next.sugarG, next.addedSugarG);
        if (patch.sugarG !== undefined) next.addedSugarG = Math.min(next.addedSugarG, next.sugarG);
        // A manual nutrient edit becomes the new reference for gram scaling.
        return next.grams > 0 ? { ...next, base: baseOf(next) } : next;
      }),
    );
  }

  function changeGrams(key: string, grams: number) {
    setItems((cur) =>
      cur.map((i) => {
        if (i.key !== key) return i;
        const base = i.base ?? baseOf(i);
        return { ...i, ...scaleItem(base, grams), base };
      }),
    );
  }

  function addSaved(food: SavedFoodOption) {
    const { id, ...rest } = food;
    setItems((cur) => [...cur, { ...rest, key: newKey(), confidence: null, assumptions: null, savedFoodId: id }]);
  }

  function addScanned({ hasNutrition, addedSugarFromTotal, ...item }: BarcodeItem) {
    setScanning(false);
    const assumptions = !hasNutrition ? t("nutrition.noNutritionAssumption") : addedSugarFromTotal ? t("nutrition.addedSugarFromLabel") : null;
    setItems((cur) => [...cur, { ...item, key: newKey(), gi: null, confidence: null, assumptions }]);
    if (hasNutrition) toast.success(t("nutrition.addedItem", { name: item.name }));
    else toast(t("nutrition.noNutritionToast"));
  }

  /** Load an earlier meal into the draft so it can be adjusted before saving. */
  function addRecent(meal: RecentMealOption) {
    setItems((cur) => [...cur, ...meal.items.map((i) => ({ ...i, key: newKey(), confidence: null, assumptions: null }))]);
    setTitle((cur) => cur || meal.description);
  }

  function removeSaved(food: SavedFoodOption) {
    startRemoving(async () => {
      const res = await deleteSavedFood(food.id);
      if (!res.ok) toast.error(res.error);
    });
  }

  function save() {
    const clean = items.filter((i) => i.name.trim());
    if (clean.length === 0) {
      toast.error(t("nutrition.addAtLeastOne"));
      return;
    }
    const description = title.trim() || text.trim().slice(0, 120) || clean.map((i) => i.name).join(", ").slice(0, 120);
    const cleanItems = clean.map(({ key: _k, savedFoodId: _s, base: _b, ...i }) => ({ ...i, name: i.name.trim() }));
    const back = isToday ? "/nutrition" : `/nutrition?date=${date}`;
    if (editing) {
      startSaving(async () => {
        const res = await updateMeal(editing.id, { mealType, description, items: cleanItems, eatenTime: eatenTime ?? undefined });
        if (!res.ok) return void toast.error(res.error);
        const usedSaved = clean.flatMap((i) => (i.savedFoodId ? [i.savedFoodId] : []));
        if (usedSaved.length) await markSavedFoodsUsed(usedSaved);
        toast.success(t("nutrition.mealUpdated"));
        router.push(back);
      });
      return;
    }
    startSaving(async () => {
      const res = await saveMeal({
        mealType,
        description,
        source,
        notes,
        eatenAt: new Date().toISOString(),
        eatenTime: eatenTime ?? undefined,
        localDate: date,
        items: cleanItems,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const usedSaved = clean.flatMap((i) => (i.savedFoodId ? [i.savedFoodId] : []));
      if (usedSaved.length) await markSavedFoodsUsed(usedSaved);
      toast.success(t("nutrition.mealLogged"));
      // Routes stay mounted (hidden) after navigation, so clear the draft.
      setItems([]);
      setText("");
      setImages([]);
      setTitle("");
      setNotes(null);
      setSource("MANUAL");
      // The next meal starts from "now" (device clock; the page sets the same default).
      if (eatenTime !== null) setEatenTime(new Date().toTimeString().slice(0, 5));
      router.push(back);
    });
  }

  const totals = sumNutrients(items);

  /** Ways to put food into the draft: AI, barcode, recent meals, saved foods. */
  const adders = (
    <>
      <Card className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="size-4 text-iron" /> {editing ? t("nutrition.describeToAdd") : t("nutrition.describeTitle")}
        </div>
        {/* Photos first: the quickest way to log what's on the table. */}
        <MealPhotos images={images} onPick={onPickImages} onRemove={(i) => setImages((cur) => cur.filter((_, j) => j !== i))} />
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          // With photos, ask for what the camera can't see.
          placeholder={images.length ? t("nutrition.photoDetailsPlaceholder") : t("nutrition.describePlaceholder")}
          maxLength={1000}
          aria-label={t("nutrition.mealDescription")}
          className="min-h-16"
        />
        {/* Secondary until there's a photo or words to analyse, so the camera leads when the card is empty. */}
        <Button type="button" variant={images.length || text.trim() ? "primary" : "secondary"} className="w-full" onClick={analyze} disabled={analyzing}>
          {analyzing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {analyzing ? t("nutrition.analysing") : t("nutrition.analyse")}
        </Button>
      </Card>

      <Button type="button" variant="secondary" className="w-full" onClick={() => setScanning(true)}>
        <ScanBarcode className="size-4" /> {t("nutrition.scanBarcode")}
      </Button>
      {scanning && <BarcodeScanner onFound={addScanned} onClose={() => setScanning(false)} />}

      {recentMeals.length > 0 && (
        <section>
          <h2 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-steel">
            <History className="size-4" /> {t("nutrition.recentMeals")}
          </h2>
          <ul className="divide-y divide-line border-y border-line">
            {[...recentMeals]
              .sort((a, b) => Number(b.mealType === mealType) - Number(a.mealType === mealType))
              .slice(0, 5)
              .map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => addRecent(m)}
                    aria-label={t("nutrition.addNamed", { name: m.description })}
                    className="flex w-full items-center gap-3 py-2.5 text-left text-sm hover:bg-wash"
                  >
                    <Plus className="size-4 shrink-0 text-steel" aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-medium">{m.description}</span>
                    <span className="num text-steel">
                      {Math.round(m.kcal).toLocaleString("en-US")} {t("common.kcal")}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </section>
      )}

      {savedFoods.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-steel">
              <Star className="size-4" /> {t("nutrition.savedFoods")}
            </h2>
            <button
              type="button"
              onClick={() => setEditingSaved((e) => !e)}
              aria-pressed={editingSaved}
              className="rounded-[8px] px-2 py-1 text-[13px] font-medium text-steel hover:bg-wash hover:text-iron"
            >
              {editingSaved ? t("common.done") : t("common.edit")}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {savedFoods.map((f) =>
              editingSaved ? (
                <button
                  key={f.id}
                  type="button"
                  disabled={removing}
                  onClick={() => removeSaved(f)}
                  aria-label={t("nutrition.removeSavedFood", { name: f.name })}
                  className="inline-flex items-center gap-1.5 rounded-full border border-alert/40 bg-paper px-3 py-1.5 text-sm text-alert hover:bg-alert/10 disabled:opacity-50"
                >
                  <X className="size-3.5" aria-hidden /> {f.name}
                </button>
              ) : (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => addSaved(f)}
                  className="rounded-full border border-line bg-paper px-3 py-1.5 text-sm hover:border-iron"
                >
                  {f.name}{" "}
                  <span className="num text-steel">
                    {Math.round(f.kcal)} {t("common.kcal")}
                  </span>
                </button>
              ),
            )}
          </div>
          {editingSaved && <p className="mt-2 text-xs text-steel">{t("nutrition.savedFoodsHint")}</p>}
        </section>
      )}
    </>
  );

  /** The draft's items, editable. */
  const review = (
    <>
      {items.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="display text-[22px]">{editing ? t("nutrition.inThisMeal") : t("nutrition.review")}</h2>
            {source !== "MANUAL" && <span className="text-[13px] text-steel">{t("nutrition.aiEstimateHint")}</span>}
          </div>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("nutrition.mealName")} aria-label={t("nutrition.mealName")} maxLength={120} />
          {items.map((item) => (
            <DraftRow
              key={item.key}
              item={item}
              showGi={carbBudget !== null}
              onChange={update}
              onGrams={changeGrams}
              onRemove={(k) => setItems((cur) => cur.filter((i) => i.key !== k))}
            />
          ))}
          {notes && <p className="text-xs text-steel">{notes}</p>}
        </section>
      )}

      <Button type="button" variant="ghost" edge="start" onClick={() => setItems((cur) => [...cur, emptyItem()])}>
        <Plus className="size-4" /> {t("nutrition.addManually")}
      </Button>
    </>
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label={t("nutrition.mealType")}>
        {MEAL_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            role="radio"
            aria-checked={mealType === type}
            onClick={() => setMealType(type)}
            className={cn(
              "rounded-[10px] border py-2 text-xs font-semibold sm:text-sm",
              mealType === type ? "border-iron bg-iron text-iron-fg" : "border-line text-steel hover:border-iron",
            )}
          >
            {t(`labels.mealType.${type}`)}
          </button>
        ))}
      </div>

      {eatenTime !== null && (
        <label className="flex items-center justify-between gap-3 text-sm font-medium">
          {t("nutrition.timeEaten")}
          <Input type="time" value={eatenTime} onChange={(e) => setEatenTime(e.target.value)} required className="num h-10 w-36" />
        </label>
      )}

      {editing ? (
        // Editing: the meal itself comes first, ways to add more food after it.
        <>
          {review}
          <section className="space-y-5 border-t border-line pt-6" aria-labelledby="add-food">
            <h2 id="add-food" className="display text-[22px]">
              {t("nutrition.addToMeal")}
            </h2>
            {adders}
          </section>
        </>
      ) : (
        <>
          {adders}
          {review}
        </>
      )}

      {items.length > 0 && (
        <div className="sticky bottom-20 z-20 md:bottom-4">
          <Card className="flex items-center gap-3 border border-line shadow-[0_8px_24px_-12px_rgba(31,34,38,0.45)]">
            <div className="flex-1">
              <p>
                <span className="score text-[30px]" data-testid="draft-total-kcal">{Math.round(totals.kcal)}</span>
                <span className="ml-1 text-sm text-steel">{t("common.kcal")}</span>
              </p>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <MacroLine p={totals.proteinG} c={totals.carbsG} f={totals.fatG} />
                <SugarTag total={totals.sugarG} added={totals.addedSugarG} high={totals.addedSugarG >= HIGH_SUGAR_MEAL_G} />
              </p>
              {carbBudget && <CarbBudgetLine carbs={totals.carbsG} range={budgetFor(carbBudget, mealType)} />}
            </div>
            <Button onClick={save} disabled={saving} size="lg">
              {saving ? t("common.saving") : editing ? t("nutrition.saveChanges") : t("nutrition.saveMeal")}
            </Button>
          </Card>
        </div>
      )}
    </div>
  );
}

function NumField({ label, value, onChange, className }: { label: string; value: number; onChange: (v: number) => void; className?: string }) {
  return (
    <label className={cn("flex flex-col gap-0.5 text-[11px] font-medium text-steel", className)}>
      {label}
      <Input
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="num h-9 px-2"
      />
    </label>
  );
}

function DraftRow({
  item,
  showGi,
  onChange,
  onGrams,
  onRemove,
}: {
  item: DraftItem;
  showGi: boolean;
  onChange: (key: string, patch: Partial<DraftItem>) => void;
  onGrams: (key: string, grams: number) => void;
  onRemove: (key: string) => void;
}) {
  const t = useT();
  return (
    // Two columns: the name, numbers and notes share one edge; delete has its own column.
    <div className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-2 border-t border-line py-4" data-testid="draft-item">
      <Input
        value={item.name}
        onChange={(e) => onChange(item.key, { name: e.target.value })}
        placeholder={t("nutrition.foodName")}
        aria-label={t("nutrition.foodName")}
        className="font-medium"
      />
      <IconButton tone="danger" edge="end" aria-label={t("nutrition.removeNamed", { name: item.name || t("nutrition.item") })} onClick={() => onRemove(item.key)} className="self-center">
        <Trash2 className="size-4" />
      </IconButton>
      <div className="col-start-1 grid grid-cols-4 items-end gap-2 sm:grid-cols-7">
        <NumField label={t("nutrition.gramsField")} value={item.grams} onChange={(v) => onGrams(item.key, v)} className="[&_input]:border-iron/60" />
        <NumField label={t("common.kcal")} value={item.kcal} onChange={(v) => onChange(item.key, { kcal: v })} />
        <NumField label={t("common.protein")} value={item.proteinG} onChange={(v) => onChange(item.key, { proteinG: v })} />
        <NumField label={t("common.carbs")} value={item.carbsG} onChange={(v) => onChange(item.key, { carbsG: v })} />
        <NumField label={t("common.fat")} value={item.fatG} onChange={(v) => onChange(item.key, { fatG: v })} />
        <NumField label={t("nutrition.sugar")} value={item.sugarG} onChange={(v) => onChange(item.key, { sugarG: v })} />
        <NumField label={t("nutrition.addedSugar")} value={item.addedSugarG} onChange={(v) => onChange(item.key, { addedSugarG: v })} />
      </div>
      {(item.assumptions || item.confidence !== null || (showGi && item.gi !== null)) && (
        <p className="col-start-1 text-xs text-steel">
          {showGi && <GiTag gi={item.gi} />}{" "}
          {item.confidence !== null && (
            <span className={cn("mr-1.5", item.confidence < 0.6 ? "font-semibold text-iron" : "")}>
              {item.confidence < 0.6 ? t("nutrition.roughEstimate") : t("nutrition.confident", { pct: Math.round(item.confidence * 100) })}
            </span>
          )}
          {item.assumptions}
        </p>
      )}
    </div>
  );
}

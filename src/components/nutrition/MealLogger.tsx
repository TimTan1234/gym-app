"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, Loader2, Plus, Sparkles, Star, Trash2, X } from "lucide-react";
import { saveMeal, markSavedFoodsUsed } from "@/server/nutrition";
import { scaleItem, sumNutrients } from "@/lib/nutrition/totals";
import type { MealAnalysis } from "@/lib/ai/schemas";
import { MEAL_TYPE_LABELS } from "@/components/profile/options";
import { Button, Card, Input, MacroLine, Textarea, cn } from "@/components/ui";
import { useClientValue } from "@/lib/use-client";

type MealType = keyof typeof MEAL_TYPE_LABELS;
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
  sodiumMg: number;
  confidence: number | null;
  assumptions: string | null;
  savedFoodId?: string;
  /** Reference values that gram changes scale from (avoids compounding rounding). */
  base?: BaseValues;
}

type BaseValues = Pick<DraftItem, "grams" | "kcal" | "proteinG" | "carbsG" | "fatG" | "fiberG" | "sugarG" | "sodiumMg">;

function baseOf(i: DraftItem): BaseValues {
  const { grams, kcal, proteinG, carbsG, fatG, fiberG, sugarG, sodiumMg } = i;
  return { grams, kcal, proteinG, carbsG, fatG, fiberG, sugarG, sodiumMg };
}

export interface SavedFoodOption extends Omit<DraftItem, "key" | "confidence" | "assumptions" | "savedFoodId"> {
  id: string;
}

const MAX_DIM = 1024;

async function resizeImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.82);
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
  sodiumMg: 0,
  confidence: null,
  assumptions: null,
});

export function MealLogger({
  date,
  isToday,
  initialType,
  savedFoods,
}: {
  date: string;
  isToday: boolean;
  initialType: MealType | null;
  savedFoods: SavedFoodOption[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const guessedType = useClientValue(guessMealType, "LUNCH");
  const [chosenType, setMealType] = useState<MealType | null>(initialType);
  const mealType = chosenType ?? guessedType;
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState<string | null>(null);
  const [source, setSource] = useState<Source>("MANUAL");
  const [saving, startSaving] = useTransition();

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setImage(await resizeImage(file));
    } catch {
      toast.error("Couldn't read that image");
    }
  }

  async function analyze() {
    if (!text.trim() && !image) {
      toast.error("Describe your meal or add a photo first");
      return;
    }
    setAnalyzing(true);
    try {
      const res = await fetch("/api/ai/meal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() || undefined, image: image ?? undefined }),
      });
      const data = (await res.json()) as { analysis?: MealAnalysis; error?: string };
      if (!res.ok || !data.analysis) throw new Error(data.error ?? "Analysis failed");
      const a = data.analysis;
      setItems((cur) => [...cur, ...a.items.map((i) => ({ ...i, key: newKey() }))]);
      setTitle((t) => t || a.title);
      setNotes(a.notes);
      setSource(image ? "AI_PHOTO" : "AI_TEXT");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  function update(key: string, patch: Partial<DraftItem>) {
    setItems((cur) =>
      cur.map((i) => {
        if (i.key !== key) return i;
        const next = { ...i, ...patch };
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

  function save() {
    const clean = items.filter((i) => i.name.trim());
    if (clean.length === 0) {
      toast.error("Add at least one food item");
      return;
    }
    const description = title.trim() || text.trim().slice(0, 120) || clean.map((i) => i.name).join(", ").slice(0, 120);
    startSaving(async () => {
      const res = await saveMeal({
        mealType,
        description,
        source,
        notes,
        eatenAt: new Date().toISOString(),
        localDate: date,
        items: clean.map(({ key: _k, savedFoodId: _s, base: _b, ...i }) => ({ ...i, name: i.name.trim() })),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const usedSaved = clean.flatMap((i) => (i.savedFoodId ? [i.savedFoodId] : []));
      if (usedSaved.length) await markSavedFoodsUsed(usedSaved);
      toast.success("Meal logged");
      // Routes stay mounted (hidden) after navigation, so clear the draft.
      setItems([]);
      setText("");
      setImage(null);
      setTitle("");
      setNotes(null);
      setSource("MANUAL");
      router.push(isToday ? "/nutrition" : `/nutrition?date=${date}`);
    });
  }

  const totals = sumNutrients(items);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Meal type">
        {(Object.keys(MEAL_TYPE_LABELS) as MealType[]).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={mealType === t}
            onClick={() => setMealType(t)}
            className={cn(
              "rounded-[10px] border py-2 text-xs font-semibold sm:text-sm",
              mealType === t ? "border-iron bg-iron text-iron-fg" : "border-line text-steel hover:border-iron",
            )}
          >
            {MEAL_TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      <Card className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="size-4 text-iron" /> Describe or snap your meal
        </div>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. 2 roti canai with dhal curry and a teh tarik"
          maxLength={1000}
          aria-label="Meal description"
        />
        {image && (
          <div className="relative w-fit">
            {/* eslint-disable-next-line @next/next/no-img-element -- local data URL preview */}
            <img src={image} alt="Meal photo preview" className="max-h-48 rounded-xl" />
            <button
              type="button"
              aria-label="Remove photo"
              onClick={() => setImage(null)}
              className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white"
            >
              <X className="size-4" />
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPickImage} />
          <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
            <Camera className="size-4" /> {image ? "Change photo" : "Photo"}
          </Button>
          <Button type="button" className="flex-1" onClick={analyze} disabled={analyzing}>
            {analyzing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {analyzing ? "Analysing…" : "Analyse with AI"}
          </Button>
        </div>
      </Card>

      {savedFoods.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-steel">
            <Star className="size-4" /> Saved foods
          </h2>
          <div className="flex flex-wrap gap-2">
            {savedFoods.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => addSaved(f)}
                className="rounded-full border border-line bg-paper px-3 py-1.5 text-sm hover:border-iron"
              >
                {f.name} <span className="num text-steel">{Math.round(f.kcal)} kcal</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {items.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="display text-[22px]">Review &amp; adjust</h2>
            {source !== "MANUAL" && <span className="text-[13px] text-steel">AI estimate. Adjust grams to correct it.</span>}
          </div>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Meal name" aria-label="Meal name" maxLength={120} />
          {items.map((item) => (
            <DraftRow key={item.key} item={item} onChange={update} onGrams={changeGrams} onRemove={(k) => setItems((cur) => cur.filter((i) => i.key !== k))} />
          ))}
          {notes && <p className="text-xs text-steel">{notes}</p>}
        </section>
      )}

      <Button type="button" variant="ghost" onClick={() => setItems((cur) => [...cur, emptyItem()])}>
        <Plus className="size-4" /> Add item manually
      </Button>

      {items.length > 0 && (
        <div className="sticky bottom-20 z-20 md:bottom-4">
          <Card className="flex items-center gap-3 border border-line shadow-[0_8px_24px_-12px_rgba(31,34,38,0.45)]">
            <div className="flex-1">
              <p>
                <span className="score text-[30px]" data-testid="draft-total-kcal">{Math.round(totals.kcal)}</span>
                <span className="ml-1 text-sm text-steel">kcal</span>
              </p>
              <MacroLine p={totals.proteinG} c={totals.carbsG} f={totals.fatG} />
            </div>
            <Button onClick={save} disabled={saving} size="lg">
              {saving ? "Saving…" : "Save meal"}
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
  onChange,
  onGrams,
  onRemove,
}: {
  item: DraftItem;
  onChange: (key: string, patch: Partial<DraftItem>) => void;
  onGrams: (key: string, grams: number) => void;
  onRemove: (key: string) => void;
}) {
  return (
    <div className="space-y-2 border-t border-line py-4" data-testid="draft-item">
      <div className="flex items-center gap-2">
        <Input
          value={item.name}
          onChange={(e) => onChange(item.key, { name: e.target.value })}
          placeholder="Food name"
          aria-label="Food name"
          className="font-medium"
        />
        <button type="button" aria-label={`Remove ${item.name || "item"}`} onClick={() => onRemove(item.key)} className="rounded-lg p-2 text-steel hover:text-alert">
          <Trash2 className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        <NumField label="Grams" value={item.grams} onChange={(v) => onGrams(item.key, v)} className="[&_input]:border-iron/60" />
        <NumField label="kcal" value={item.kcal} onChange={(v) => onChange(item.key, { kcal: v })} />
        <NumField label="Protein" value={item.proteinG} onChange={(v) => onChange(item.key, { proteinG: v })} />
        <NumField label="Carbs" value={item.carbsG} onChange={(v) => onChange(item.key, { carbsG: v })} />
        <NumField label="Fat" value={item.fatG} onChange={(v) => onChange(item.key, { fatG: v })} />
      </div>
      {(item.assumptions || item.confidence !== null) && (
        <p className="text-xs text-steel">
          {item.confidence !== null && (
            <span className={cn("mr-1.5", item.confidence < 0.6 ? "font-semibold text-iron" : "")}>
              {item.confidence < 0.6 ? "Rough estimate." : `${Math.round(item.confidence * 100)}% confident.`}
            </span>
          )}
          {item.assumptions}
        </p>
      )}
    </div>
  );
}

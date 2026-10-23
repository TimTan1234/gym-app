"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, X } from "lucide-react";
import { createProcurementPlan } from "@/server/procurement";
import {
  GROCERY_CATEGORIES,
  type GroceryCategory,
  type PlannedMeal,
  type DraftPlan,
  type ProcurementSource,
} from "@/lib/ai/schemas";
import { formatMoney, planCost, planNutrition, type CheckProfile } from "@/lib/procurement/summary";
import { NUTRIENT_KEYS } from "@/lib/nutrition/totals";
import { Button, Card, IconButton, Input, Label, Select, cn } from "@/components/ui";
import { NumField } from "./fields";
import { NutritionCheck } from "./NutritionCheck";
import { useT } from "@/i18n/client";

export interface EditorItem {
  key: string;
  name: string;
  quantity: number;
  unit: string;
  category: GroceryCategory;
  estPrice: number | null;
  store: string | null;
  consumedGrams: number | null;
  kcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  addedSugarG: number | null;
  sodiumMg: number | null;
  gi: number | null;
  /** The name the nutrition was estimated for; renaming the item makes it stale. */
  estimatedFor: string | null;
}

export interface EditorDraft {
  title: string;
  days: number;
  people: number;
  budget: number | null;
  currency: string;
  notes: string | null;
  items: EditorItem[];
  meals: (PlannedMeal & { key: string })[];
}

let keySeq = 0;
const newKey = () => `g${++keySeq}`;

const UNKNOWN_NUTRIENTS = { consumedGrams: null, gi: null, ...Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, null])) } as Pick<
  EditorItem,
  "consumedGrams" | "gi" | (typeof NUTRIENT_KEYS)[number]
>;

export const emptyItem = (): EditorItem => ({
  key: newKey(),
  name: "",
  quantity: 1,
  unit: "",
  category: "OTHER",
  estPrice: null,
  store: null,
  ...UNKNOWN_NUTRIENTS,
  estimatedFor: null,
});

/** An AI draft as an editable draft; values the source didn't state come from what the user chose. */
export function editorDraft(d: DraftPlan, fallback: { days: number; people: number; budget: number | null; currency: string }): EditorDraft {
  return {
    title: d.title,
    days: d.days ?? fallback.days,
    people: d.people ?? fallback.people,
    budget: d.budget ?? fallback.budget,
    currency: d.currency ?? fallback.currency,
    notes: d.notes,
    items: d.items.map((i) => ({ ...i, key: newKey(), estimatedFor: i.name })),
    meals: d.meals.map((m) => ({ ...m, key: newKey() })),
  };
}

export const blankDraft = (title: string, currency: string): EditorDraft => ({
  title,
  days: 7,
  people: 1,
  budget: null,
  currency,
  notes: null,
  items: [emptyItem()],
  meals: [],
});

export function DraftEditor({
  initial,
  source,
  profile,
  onDiscard,
}: {
  initial: EditorDraft;
  source: ProcurementSource;
  profile: CheckProfile;
  onDiscard: () => void;
}) {
  const t = useT();
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [days, setDays] = useState(initial.days);
  const [people, setPeople] = useState(initial.people);
  const [budget, setBudget] = useState(initial.budget);
  const [items, setItems] = useState(initial.items);
  const [meals, setMeals] = useState(initial.meals);
  const [saving, startSaving] = useTransition();
  const { currency, notes } = initial;

  function update(key: string, patch: Partial<EditorItem>) {
    setItems((cur) => cur.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }

  // Estimates were made for the starting period and household, and for each
  // item's name then. If those changed, they're dropped on save and estimated
  // again from the plan's Nutrition tab.
  const reshared = days !== initial.days || people !== initial.people;
  const current = (i: EditorItem) => !reshared && i.estimatedFor !== null && i.estimatedFor.trim().toLowerCase() === i.name.trim().toLowerCase();
  const withEstimates = items.map((i) => (current(i) ? i : { ...i, ...UNKNOWN_NUTRIENTS }));

  const cost = planCost(items, budget);
  const { perDay, missing } = planNutrition(withEstimates, days);
  const money = (n: number) => formatMoney(n, currency, t.locale);

  function save() {
    const clean = withEstimates.filter((i) => i.name.trim());
    if (clean.length === 0) return void toast.error(t("procurement.addAtLeastOne"));
    startSaving(async () => {
      const res = await createProcurementPlan({
        title: title.trim() || t("procurement.untitled"),
        source,
        days,
        people,
        budget,
        currency,
        notes,
        items: clean.map(({ key: _key, estimatedFor: _estimatedFor, ...i }) => ({ ...i, name: i.name.trim(), unit: i.unit.trim() })),
        meals: meals.map(({ key: _key, ...m }) => m),
      });
      if (!res.ok || !res.id) return void toast.error(res.ok ? t("common.somethingWrong") : res.error);
      toast.success(t("procurement.saved"));
      router.push(`/nutrition/procurement/${res.id}`);
    });
  }

  return (
    <div className="space-y-6 pb-4">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="display text-[22px]">{t("procurement.reviewTitle")}</h2>
          {source !== "MANUAL" && <span className="text-[13px] text-steel">{t("procurement.aiEstimateHint")}</span>}
        </div>
        <Label>
          {t("procurement.fields.title")}
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
        </Label>
        <div className="grid grid-cols-3 items-end gap-2">
          <NumField label={t("procurement.fields.days")} value={days} min={1} max={31} step="1" onChange={(v) => setDays(Math.round(v ?? 1))} />
          <NumField label={t("procurement.fields.people")} value={people} min={1} max={12} step="1" onChange={(v) => setPeople(Math.round(v ?? 1))} />
          <NumField
            label={t("procurement.fields.budget", { currency })}
            value={budget}
            nullable
            placeholder={t("common.optional")}
            onChange={setBudget}
          />
        </div>
        {notes && <p className="text-xs text-steel">{notes}</p>}
      </section>

      <section>
        <h3 className="mb-1 text-sm font-semibold text-steel">{t("procurement.itemsCount", { count: items.length })}</h3>
        {items.map((item) => (
          <ItemRow
            key={item.key}
            item={item}
            currency={currency}
            onChange={update}
            onRemove={(k) => setItems((cur) => cur.filter((i) => i.key !== k))}
          />
        ))}
        <Button type="button" variant="ghost" edge="start" className="mt-2" onClick={() => setItems((cur) => [...cur, emptyItem()])}>
          <Plus className="size-4" /> {t("procurement.addItem")}
        </Button>
      </section>

      {meals.length > 0 && (
        <section>
          <h3 className="mb-1 text-sm font-semibold text-steel">{t("procurement.mealsCount", { count: meals.length })}</h3>
          <ul className="divide-y divide-line border-y border-line">
            {meals.map((m) => (
              <li key={m.key} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-24 shrink-0 text-steel">
                  {t("procurement.dayN", { day: m.day })} · {t(`labels.mealType.${m.mealType}`)}
                </span>
                <span className="min-w-0 flex-1">{m.description}</span>
                <IconButton
                  edge="end"
                  tone="danger"
                  aria-label={t("procurement.removeNamed", { name: m.description })}
                  onClick={() => setMeals((cur) => cur.filter((x) => x.key !== m.key))}
                >
                  <X className="size-4" />
                </IconButton>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-steel">{t("procurement.nutrition.perDayTitle")}</h3>
        {missing < withEstimates.length && <NutritionCheck perDay={perDay} profile={profile} compact />}
        {reshared && initial.items.some((i) => i.kcal !== null) ? (
          <p className="text-xs text-steel">{t("procurement.nutrition.reshared")}</p>
        ) : missing === withEstimates.length ? (
          // Nothing estimated yet, e.g. a generated plan: nutrition comes after saving.
          <p className="text-xs text-steel" data-testid="estimate-after-save">
            {t("procurement.nutrition.afterSave")}
          </p>
        ) : (
          missing > 0 && <p className="text-xs text-steel">{t("procurement.nutrition.missing", { count: missing })}</p>
        )}
      </section>

      <div className="sticky bottom-20 z-20 md:bottom-4">
        <Card className="flex items-center gap-3 border border-line shadow-[0_8px_24px_-12px_rgba(31,34,38,0.45)]">
          <div className="min-w-0 flex-1">
            <p className="num text-[20px] font-semibold" data-testid="draft-total-cost">
              {money(cost.estimated)}
            </p>
            <p className={cn("text-[13px]", cost.overBudget ? "font-semibold text-alert" : "text-steel")}>
              {budget == null
                ? t("procurement.budget.noBudget")
                : cost.overBudget
                  ? t("procurement.budget.over", { amount: money(-(cost.remaining ?? 0)) })
                  : t("procurement.budget.left", { amount: money(cost.remaining ?? 0) })}
            </p>
          </div>
          <Button type="button" variant="ghost" onClick={onDiscard} disabled={saving}>
            {t("procurement.discard")}
          </Button>
          <Button type="button" size="lg" onClick={save} disabled={saving}>
            {saving ? t("common.saving") : t("procurement.savePlan")}
          </Button>
        </Card>
      </div>
    </div>
  );
}

function ItemRow({
  item,
  currency,
  onChange,
  onRemove,
}: {
  item: EditorItem;
  currency: string;
  onChange: (key: string, patch: Partial<EditorItem>) => void;
  onRemove: (key: string) => void;
}) {
  const t = useT();
  return (
    <div className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-2 border-t border-line py-3" data-testid="draft-grocery">
      <Input
        value={item.name}
        onChange={(e) => onChange(item.key, { name: e.target.value })}
        placeholder={t("procurement.fields.item")}
        aria-label={t("procurement.fields.item")}
        maxLength={120}
        className="font-medium"
      />
      <IconButton tone="danger" edge="end" className="self-center" aria-label={t("procurement.removeNamed", { name: item.name || t("procurement.fields.item") })} onClick={() => onRemove(item.key)}>
        <Trash2 className="size-4" />
      </IconButton>
      <div className="col-start-1 grid grid-cols-2 items-end gap-2 sm:grid-cols-4">
        <NumField label={t("procurement.fields.quantity")} value={item.quantity} onChange={(v) => onChange(item.key, { quantity: v ?? 0 })} />
        <label className="flex min-w-0 flex-col gap-0.5 text-[11px] font-medium text-steel">
          {t("procurement.fields.unit")}
          <Input value={item.unit} onChange={(e) => onChange(item.key, { unit: e.target.value })} maxLength={30} className="h-9 px-2" />
        </label>
        <label className="flex min-w-0 flex-col gap-0.5 text-[11px] font-medium text-steel">
          {t("procurement.fields.category")}
          <Select value={item.category} onChange={(e) => onChange(item.key, { category: e.target.value as GroceryCategory })} className="h-9 px-2 text-sm">
            {GROCERY_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`labels.groceryCategory.${c}`)}
              </option>
            ))}
          </Select>
        </label>
        <NumField
          label={t("procurement.fields.price", { currency })}
          value={item.estPrice}
          nullable
          onChange={(v) => onChange(item.key, { estPrice: v })}
        />
      </div>
      {item.kcal !== null && item.consumedGrams !== null && item.consumedGrams > 0 && item.estimatedFor?.trim().toLowerCase() === item.name.trim().toLowerCase() && (
        <p className="col-start-1 text-xs text-steel">
          {t("procurement.youEat", { grams: Math.round(item.consumedGrams), kcal: Math.round(item.kcal) })}
        </p>
      )}
    </div>
  );
}

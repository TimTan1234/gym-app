"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { createProcurementPlan } from "@/server/procurement";
import {
  type GroceryCategory,
  type PlannedMeal,
  type DraftPlan,
  type ProcurementSource,
} from "@/lib/ai/schemas";
import { formatMoney, groupByCategory, planCost, planNutrition, type CheckProfile } from "@/lib/procurement/summary";
import { NUTRIENT_KEYS } from "@/lib/nutrition/totals";
import { Button, IconButton, Input, Label, cn } from "@/components/ui";
import { ItemFields, NumField } from "./fields";
import { AisleHeading, PriceText, Slip, Tally } from "./Slip";
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
  // A blank list starts with its empty row open.
  const [openKey, setOpenKey] = useState<string | null>(() => initial.items.find((i) => !i.name)?.key ?? null);
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

  const groups = groupByCategory(items);
  const mealDays = [...new Set(meals.map((m) => m.day))].sort((a, b) => a - b);

  function addItem() {
    const item = emptyItem();
    setItems((cur) => [...cur, item]);
    setOpenKey(item.key);
  }

  return (
    <div className="space-y-7 pb-36">
      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
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
        {notes && <p className="text-[13px] text-steel">{notes}</p>}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-steel">{t("procurement.itemsCount", { count: items.length })}</h3>
        <Slip>
          {groups.map((group) => (
            <section key={group.category}>
              <AisleHeading category={group.category} subtotal={group.items.reduce((sum, i) => sum + (i.estPrice ?? 0), 0)} />
              <ul>
                {group.items.map((item) => (
                  <DraftRow
                    key={item.key}
                    item={item}
                    currency={currency}
                    open={openKey === item.key}
                    onOpen={(open) => setOpenKey(open ? item.key : null)}
                    onChange={update}
                    onRemove={(k) => setItems((cur) => cur.filter((i) => i.key !== k))}
                  />
                ))}
              </ul>
            </section>
          ))}
          <Button type="button" variant="ghost" edge="start" className="mt-2" onClick={addItem}>
            <Plus className="size-4" /> {t("procurement.addItem")}
          </Button>
        </Slip>
      </section>

      {meals.length > 0 && (
        <section>
          <h3 className="mb-1 text-sm font-semibold text-steel">{t("procurement.mealsCount", { count: meals.length })}</h3>
          {mealDays.map((day) => (
            <div key={day} className="border-t border-line py-2">
              <p className="display text-[15px]">{t("procurement.dayN", { day })}</p>
              <ul>
                {meals
                  .filter((m) => m.day === day)
                  .map((m) => (
                    <li key={m.key} className="flex items-center gap-3 text-sm">
                      <span className="w-20 shrink-0 text-steel">{t(`labels.mealType.${m.mealType}`)}</span>
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
            </div>
          ))}
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

      <Tally className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="score text-[30px]" data-testid="draft-total-cost">
            {money(cost.estimated)}
          </p>
          <p className={cn("text-[12px]", cost.overBudget ? "font-semibold underline decoration-2 underline-offset-2" : "opacity-75")}>
            {budget == null
              ? t("procurement.budget.noBudget")
              : cost.overBudget
                ? t("procurement.budget.over", { amount: money(-(cost.remaining ?? 0)) })
                : t("procurement.budget.left", { amount: money(cost.remaining ?? 0) })}
          </p>
        </div>
        <Button type="button" variant="inverse-ghost" size="sm" onClick={onDiscard} disabled={saving}>
          {t("procurement.discard")}
        </Button>
        <Button type="button" variant="inverse" onClick={save} disabled={saving}>
          {saving ? t("common.saving") : t("procurement.savePlan")}
        </Button>
      </Tally>
    </div>
  );
}

/** One item on the draft slip: a printed line that opens into its fields when tapped. */
function DraftRow({
  item,
  currency,
  open,
  onOpen,
  onChange,
  onRemove,
}: {
  item: EditorItem;
  currency: string;
  open: boolean;
  onOpen: (open: boolean) => void;
  onChange: (key: string, patch: Partial<EditorItem>) => void;
  onRemove: (key: string) => void;
}) {
  const t = useT();
  const name = item.name || t("procurement.fields.item");
  const remove = (
    <IconButton tone="danger" edge="end" aria-label={t("procurement.removeNamed", { name })} onClick={() => onRemove(item.key)}>
      <X className="size-4" />
    </IconButton>
  );
  const showsShare =
    item.kcal !== null && item.consumedGrams !== null && item.consumedGrams > 0 && item.estimatedFor?.trim().toLowerCase() === item.name.trim().toLowerCase();

  return (
    <li
      data-testid="draft-grocery"
      data-name={item.name}
      data-quantity={item.quantity}
      data-unit={item.unit}
      data-price={item.estPrice ?? ""}
      className={open ? "border-b border-dashed border-line py-3" : undefined}
    >
      {open ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Input
              value={item.name}
              onChange={(e) => onChange(item.key, { name: e.target.value })}
              placeholder={t("procurement.fields.item")}
              aria-label={t("procurement.fields.item")}
              maxLength={120}
              autoFocus={!item.name}
              className="font-medium"
            />
            {remove}
          </div>
          <ItemFields
            quantity={item.quantity}
            unit={item.unit}
            category={item.category}
            estPrice={item.estPrice}
            currency={currency}
            set={{
              setQuantity: (quantity) => onChange(item.key, { quantity }),
              setUnit: (unit) => onChange(item.key, { unit }),
              setCategory: (category) => onChange(item.key, { category }),
              setEstPrice: (estPrice) => onChange(item.key, { estPrice }),
            }}
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-steel">{showsShare && t("procurement.youEat", { grams: Math.round(item.consumedGrams!), kcal: Math.round(item.kcal!) })}</p>
            <Button type="button" variant="ghost" size="sm" edge="end" onClick={() => onOpen(false)}>
              {t("common.done")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onOpen(true)}
            aria-label={t("procurement.editNamed", { name })}
            className="flex min-h-13 min-w-0 flex-1 items-start py-2 text-left"
          >
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline">
                <span className={cn("truncate font-medium", !item.name && "text-steel")}>{name}</span>
                <span aria-hidden className="leader" />
              </span>
              <span className="num block text-[13px] text-steel">
                {item.quantity} {item.unit}
              </span>
            </span>
            <span className="shrink-0 pl-1.5 text-[15px] leading-normal">
              <PriceText paid={null} estimate={item.estPrice} />
            </span>
          </button>
          {remove}
        </div>
      )}
    </li>
  );
}

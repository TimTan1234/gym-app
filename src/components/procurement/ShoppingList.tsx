"use client";

import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { addProcurementItem, deleteProcurementItem, setItemChecked, updateProcurementItem } from "@/server/procurement";
import { GROCERY_CATEGORIES, type GroceryCategory } from "@/lib/ai/schemas";
import { formatMoney, groupByCategory, planCost } from "@/lib/procurement/summary";
import { Button, IconButton, Input, ProgressBar, Select, cn } from "@/components/ui";
import { NumField } from "./fields";
import { useT } from "@/i18n/client";

export interface ShopItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: GroceryCategory;
  estPrice: number | null;
  actualPrice: number | null;
  checked: boolean;
  sortOrder: number;
}

type Change = { id: string; patch: Partial<ShopItem> } | { id: string; remove: true };

/** Shopping mode: tick items off by aisle, note what they cost, add what was forgotten. */
export function ShoppingList({ planId, items, currency, budget }: { planId: string; items: ShopItem[]; currency: string; budget: number | null }) {
  const t = useT();
  const [shown, apply] = useOptimistic(items, (cur: ShopItem[], change: Change) =>
    "remove" in change ? cur.filter((i) => i.id !== change.id) : cur.map((i) => (i.id === change.id ? { ...i, ...change.patch } : i)),
  );
  const [, startTransition] = useTransition();
  const [hideBought, setHideBought] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const money = (n: number) => formatMoney(n, currency, t.locale);
  const cost = planCost(shown, budget);
  const done = shown.filter((i) => i.checked).length;

  /** Optimistic change + server action; the change is dropped (reverted) if the action fails. */
  function run(change: Change, action: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      apply(change);
      try {
        const res = await action();
        if (!res.ok) toast.error(res.error ?? t("common.somethingWrong"));
      } catch {
        toast.error(t("procurement.errors.offline"));
      }
    });
  }

  const toggle = (item: ShopItem) => run({ id: item.id, patch: { checked: !item.checked } }, () => setItemChecked(item.id, !item.checked));
  const setPaid = (item: ShopItem, actualPrice: number | null) =>
    run({ id: item.id, patch: { actualPrice } }, () => updateProcurementItem(item.id, { actualPrice }));

  const groups = groupByCategory(hideBought ? shown.filter((i) => !i.checked) : shown);

  return (
    <div className="space-y-5">
      <div className="sticky top-0 z-20 space-y-2 bg-chalk py-3" data-testid="shop-progress">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="font-semibold">{t("procurement.shop.progress", { done, total: shown.length })}</span>
          <span className={cn("num", cost.overBudget ? "font-semibold text-alert" : "text-steel")}>
            {budget == null ? money(cost.spent) : t("procurement.shop.spentOf", { spent: money(cost.spent), budget: money(budget) })}
          </span>
        </div>
        <ProgressBar value={done} max={shown.length} />
        <label className="flex items-center gap-2 text-[13px] text-steel">
          <input type="checkbox" checked={hideBought} onChange={(e) => setHideBought(e.target.checked)} className="size-4 accent-[var(--iron)]" />
          {t("procurement.shop.hideBought")}
        </label>
      </div>

      {groups.length === 0 && <p className="text-sm text-steel">{shown.length === 0 ? t("procurement.shop.empty") : t("procurement.shop.allBought")}</p>}

      {groups.map((group) => (
        <section key={group.category}>
          <h2 className="mb-1 text-sm font-semibold text-steel">{t(`labels.groceryCategory.${group.category}`)}</h2>
          <ul className="divide-y divide-line border-y border-line">
            {group.items.map((item) =>
              editing === item.id ? (
                <li key={item.id}>
                  <ItemEditor
                    item={item}
                    currency={currency}
                    onDone={() => setEditing(null)}
                    onSave={(patch) => {
                      setEditing(null);
                      run({ id: item.id, patch }, () => updateProcurementItem(item.id, patch));
                    }}
                    onDelete={() => {
                      setEditing(null);
                      run({ id: item.id, remove: true }, () => deleteProcurementItem(item.id));
                    }}
                  />
                </li>
              ) : (
                <li key={item.id} className="flex items-center gap-1" data-testid="shop-item">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={item.checked}
                    onClick={() => toggle(item)}
                    className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 text-left"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "grid size-6 shrink-0 place-items-center rounded-[6px] border-2",
                        item.checked ? "border-iron bg-iron text-iron-fg" : "border-line",
                      )}
                    >
                      {item.checked && <Check className="size-4" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block font-medium", item.checked && "text-steel line-through")}>{item.name}</span>
                      <span className="num block text-[13px] text-steel">
                        {item.quantity} {item.unit}
                        {item.estPrice != null && ` · ${money(item.estPrice)}`}
                      </span>
                    </span>
                  </button>
                  {item.checked && <PaidField item={item} currency={currency} onSave={(v) => setPaid(item, v)} />}
                  <IconButton edge="end" aria-label={t("procurement.editNamed", { name: item.name })} onClick={() => setEditing(item.id)}>
                    <Pencil className="size-4" />
                  </IconButton>
                </li>
              ),
            )}
          </ul>
        </section>
      ))}

      <AddItem planId={planId} currency={currency} />
    </div>
  );
}

/** What was actually paid, saved when the field loses focus. */
function PaidField({ item, currency, onSave }: { item: ShopItem; currency: string; onSave: (v: number | null) => void }) {
  const t = useT();
  const [value, setValue] = useState(item.actualPrice);
  return (
    <NumField
      label={t("procurement.shop.paid", { currency })}
      value={value}
      nullable
      placeholder={item.estPrice != null ? String(item.estPrice) : undefined}
      onChange={setValue}
      ariaLabel={t("procurement.shop.paidFor", { name: item.name, currency })}
      className="w-24 shrink-0 [&_input]:h-8"
      onBlur={(v) => v !== item.actualPrice && onSave(v)}
    />
  );
}

function ItemEditor({
  item,
  currency,
  onSave,
  onDelete,
  onDone,
}: {
  item: ShopItem;
  currency: string;
  onSave: (patch: Partial<ShopItem>) => void;
  onDelete: () => void;
  onDone: () => void;
}) {
  const t = useT();
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(item.quantity);
  const [unit, setUnit] = useState(item.unit);
  const [category, setCategory] = useState(item.category);
  const [estPrice, setEstPrice] = useState(item.estPrice);

  return (
    <form
      className="space-y-2 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onSave({ name: name.trim(), quantity, unit: unit.trim(), category, estPrice });
      }}
    >
      <Input value={name} onChange={(e) => setName(e.target.value)} aria-label={t("procurement.fields.item")} maxLength={120} className="font-medium" autoFocus />
      <ItemFields quantity={quantity} unit={unit} category={category} estPrice={estPrice} currency={currency} set={{ setQuantity, setUnit, setCategory, setEstPrice }} />
      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="danger" size="sm" onClick={onDelete}>
          <Trash2 className="size-4" /> {t("common.delete")}
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" size="sm">
            {t("common.save")}
          </Button>
        </div>
      </div>
    </form>
  );
}

function ItemFields({
  quantity,
  unit,
  category,
  estPrice,
  currency,
  set,
}: {
  quantity: number;
  unit: string;
  category: GroceryCategory;
  estPrice: number | null;
  currency: string;
  set: {
    setQuantity: (v: number) => void;
    setUnit: (v: string) => void;
    setCategory: (v: GroceryCategory) => void;
    setEstPrice: (v: number | null) => void;
  };
}) {
  const t = useT();
  return (
    <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-4">
      <NumField label={t("procurement.fields.quantity")} value={quantity} onChange={(v) => set.setQuantity(v ?? 0)} />
      <label className="flex min-w-0 flex-col gap-0.5 text-[11px] font-medium text-steel">
        {t("procurement.fields.unit")}
        <Input value={unit} onChange={(e) => set.setUnit(e.target.value)} maxLength={30} className="h-9 px-2" />
      </label>
      <label className="flex min-w-0 flex-col gap-0.5 text-[11px] font-medium text-steel">
        {t("procurement.fields.category")}
        <Select value={category} onChange={(e) => set.setCategory(e.target.value as GroceryCategory)} className="h-9 px-2 text-sm">
          {GROCERY_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`labels.groceryCategory.${c}`)}
            </option>
          ))}
        </Select>
      </label>
      <NumField label={t("procurement.fields.price", { currency })} value={estPrice} nullable onChange={set.setEstPrice} />
    </div>
  );
}

function AddItem({ planId, currency }: { planId: string; currency: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState("");
  const [category, setCategory] = useState<GroceryCategory>("OTHER");
  const [estPrice, setEstPrice] = useState<number | null>(null);
  const [adding, startAdding] = useTransition();

  if (!open) {
    return (
      <Button type="button" variant="ghost" edge="start" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> {t("procurement.addItem")}
      </Button>
    );
  }

  return (
    <form
      className="space-y-2 border-t border-line pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        startAdding(async () => {
          const res = await addProcurementItem(planId, { name: name.trim(), quantity, unit: unit.trim(), category, estPrice });
          if (!res.ok) return void toast.error(res.error);
          setName("");
          setQuantity(1);
          setUnit("");
          setEstPrice(null);
        });
      }}
    >
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("procurement.fields.item")} aria-label={t("procurement.fields.item")} maxLength={120} autoFocus />
      <ItemFields quantity={quantity} unit={unit} category={category} estPrice={estPrice} currency={currency} set={{ setQuantity, setUnit, setCategory, setEstPrice }} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          {t("common.done")}
        </Button>
        <Button type="submit" size="sm" disabled={adding || !name.trim()}>
          {t("common.add")}
        </Button>
      </div>
    </form>
  );
}

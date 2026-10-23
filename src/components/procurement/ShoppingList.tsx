"use client";

import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { addProcurementItem, deleteProcurementItem, setItemChecked, updateProcurementItem } from "@/server/procurement";
import type { GroceryCategory } from "@/lib/ai/schemas";
import { formatMoney, groupByCategory, planCost } from "@/lib/procurement/summary";
import { Button, IconButton, Input, cn } from "@/components/ui";
import { ItemFields, NumField } from "./fields";
import { AisleHeading, PriceText, Slip, Tally, TallyBar } from "./Slip";
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

/**
 * Shopping mode: the list as a till slip, by aisle. Tap an item to put it in
 * the basket, tap its price to note what it cost. Editing is behind "Edit list"
 * so the rows stay clean in the shop.
 */
export function ShoppingList({ planId, items, currency, budget }: { planId: string; items: ShopItem[]; currency: string; budget: number | null }) {
  const t = useT();
  const [shown, apply] = useOptimistic(items, (cur: ShopItem[], change: Change) =>
    "remove" in change ? cur.filter((i) => i.id !== change.id) : cur.map((i) => (i.id === change.id ? { ...i, ...change.patch } : i)),
  );
  const [, startTransition] = useTransition();
  const [hideBought, setHideBought] = useState(false);
  const [editMode, setEditMode] = useState(false);
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

  // Aisle subtotals count every item, so hiding bought ones doesn't change them.
  const subtotals = new Map(cost.byCategory.map((c) => [c.category, c.amount]));
  const groups = groupByCategory(hideBought ? shown.filter((i) => !i.checked) : shown);

  return (
    <div className="pb-32">
      <div className="mb-3 flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-[13px] text-steel">
          <input type="checkbox" checked={hideBought} onChange={(e) => setHideBought(e.target.checked)} className="size-4 accent-[var(--iron)]" />
          {t("procurement.shop.hideBought")}
        </label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          edge="end"
          aria-pressed={editMode}
          onClick={() => {
            setEditMode((m) => !m);
            setEditing(null);
          }}
        >
          {editMode ? t("common.done") : t("procurement.shop.editList")}
        </Button>
      </div>

      <Slip>
        {groups.length === 0 && (
          <p className="py-6 text-sm text-steel">{shown.length === 0 ? t("procurement.shop.empty") : t("procurement.shop.allBought")}</p>
        )}
        {groups.map((group) => (
          <section key={group.category}>
            <AisleHeading category={group.category} subtotal={subtotals.get(group.category) ?? 0} />
            <ul>
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
                  <ShopRow
                    key={item.id}
                    item={item}
                    currency={currency}
                    editMode={editMode}
                    onToggle={() => toggle(item)}
                    onPaid={(v) => setPaid(item, v)}
                    onEdit={() => setEditing(item.id)}
                  />
                ),
              )}
            </ul>
          </section>
        ))}
        <AddItem planId={planId} currency={currency} />
      </Slip>

      <Tally testId="shop-progress">
        <span className="sr-only">{t("procurement.shop.progress", { done, total: shown.length })}</span>
        <div className="flex items-end justify-between gap-4">
          <p className="flex items-baseline gap-1.5" aria-hidden>
            <span className="score text-[34px]">
              {done}
              <span className="opacity-50">/{shown.length}</span>
            </span>
            <span className="text-[13px] opacity-75">{t("procurement.shop.inBasket")}</span>
          </p>
          <p className="text-right">
            <span className="score block text-[34px]">{money(cost.projected)}</span>
            <span className={cn("block text-[12px]", cost.overBudget ? "font-semibold underline decoration-2 underline-offset-2" : "opacity-75")}>
              {budget == null
                ? t("procurement.shop.expectedTotal")
                : cost.overBudget
                  ? t("procurement.budget.over", { amount: money(-(cost.remaining ?? 0)) })
                  : t("procurement.shop.ofBudget", { budget: money(budget) })}
            </span>
          </p>
        </div>
        <TallyBar value={done} max={shown.length} />
      </Tally>
    </div>
  );
}

function ShopRow({
  item,
  currency,
  editMode,
  onToggle,
  onPaid,
  onEdit,
}: {
  item: ShopItem;
  currency: string;
  editMode: boolean;
  onToggle: () => void;
  onPaid: (v: number | null) => void;
  onEdit: () => void;
}) {
  const t = useT();
  const [paying, setPaying] = useState(false);

  return (
    // Top-aligned so the price sits on the item's name line, where its leader points.
    <li className="flex items-start" data-testid="shop-item">
      <button
        type="button"
        role="checkbox"
        aria-checked={item.checked}
        onClick={onToggle}
        className="stamp flex min-h-14 min-w-0 flex-1 items-start gap-3 py-2 text-left"
      >
        <span
          aria-hidden
          className={cn(
            "stamp-box mt-px grid size-6 shrink-0 place-items-center rounded-[6px] border-2 transition-colors",
            item.checked ? "border-iron bg-iron text-iron-fg" : "border-steel/50",
          )}
        >
          {item.checked && <Check className="size-4" strokeWidth={3} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline">
            <span className={cn("truncate font-medium", item.checked && "text-steel line-through decoration-iron/60")}>{item.name}</span>
            <span aria-hidden className="leader" />
          </span>
          <span className="num block text-[13px] text-steel">
            {item.quantity} {item.unit}
          </span>
        </span>
      </button>

      {paying ? (
        <NumField
          label=""
          ariaLabel={t("procurement.shop.paidFor", { name: item.name, currency })}
          value={item.actualPrice}
          nullable
          autoFocus
          placeholder={item.estPrice != null ? String(item.estPrice) : undefined}
          onChange={() => {}}
          onBlur={(v) => {
            setPaying(false);
            if (v !== item.actualPrice) onPaid(v);
          }}
          className="w-20 shrink-0 self-center [&_input]:text-right"
        />
      ) : item.checked ? (
        // Bought: the price is a button to note what it really cost.
        <button
          type="button"
          onClick={() => setPaying(true)}
          aria-label={t("procurement.shop.enterPaid", { name: item.name })}
          className="-mr-1 flex min-h-14 shrink-0 items-start justify-end rounded-[8px] px-1 pt-2 text-[15px] leading-normal hover:bg-wash"
        >
          <span className="underline decoration-steel/50 decoration-dotted underline-offset-4">
            <PriceText paid={item.actualPrice} estimate={item.estPrice} />
          </span>
        </button>
      ) : (
        <span className="shrink-0 pl-1.5 pt-2 text-right text-[15px] leading-normal">
          <PriceText paid={item.actualPrice} estimate={item.estPrice} />
        </span>
      )}

      {editMode && (
        <IconButton edge="end" className="ml-2 mt-2.5" aria-label={t("procurement.editNamed", { name: item.name })} onClick={onEdit}>
          <Pencil className="size-4" />
        </IconButton>
      )}
    </li>
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
      className="space-y-2 border-b border-line py-3"
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
      <Button type="button" variant="ghost" edge="start" className="mt-2" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> {t("procurement.addItem")}
      </Button>
    );
  }

  return (
    <form
      className="space-y-2 border-t border-dashed border-line pt-3"
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

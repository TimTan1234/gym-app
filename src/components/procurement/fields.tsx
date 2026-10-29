"use client";

import { useState } from "react";
import { GROCERY_CATEGORIES, type GroceryCategory } from "@/lib/ai/schemas";
import { Input, Select, cn } from "@/components/ui";
import { useT } from "@/i18n/client";

/**
 * A small labelled number input. What is typed is kept as text while the field
 * has focus, so it can be cleared and retyped; valid values are reported as you
 * type and the final one is clamped when it loses focus. With `nullable`, an
 * empty field means null instead of `min`.
 */
export function NumField({
  label,
  value,
  onChange,
  nullable = false,
  placeholder,
  min = 0,
  max,
  step = "any",
  className,
  ariaLabel,
  autoFocus,
  onBlur,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  nullable?: boolean;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: string;
  className?: string;
  /** Overrides the visible label for screen readers, e.g. to name the row. */
  ariaLabel?: string;
  autoFocus?: boolean;
  /** Called with the final value. */
  onBlur?: (v: number | null) => void;
}) {
  const [typed, setTyped] = useState<string | null>(null);
  const inRange = (n: number) => Number.isFinite(n) && n >= min && (max === undefined || n <= max);
  const clamp = (n: number) => Math.max(min, max === undefined ? n : Math.min(max, n));

  return (
    <label className={cn("flex min-w-0 flex-col gap-0.5 text-[11px] font-medium text-steel", className)}>
      {label || null}
      <Input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={typed ?? value ?? ""}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        onChange={(e) => {
          const raw = e.target.value;
          setTyped(raw);
          if (raw === "") {
            if (nullable) onChange(null);
          } else if (inRange(Number(raw))) {
            onChange(Number(raw));
          }
        }}
        onBlur={() => {
          let final = value;
          if (typed !== null) {
            const n = Number(typed);
            final = typed === "" || !Number.isFinite(n) ? (nullable ? null : min) : clamp(n);
            setTyped(null);
            if (final !== value) onChange(final);
          }
          onBlur?.(final);
        }}
        className="num h-9 px-2"
      />
    </label>
  );
}

/** One-of-n buttons, styled like the meal-type picker. */
export function Segmented<V extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: V;
  options: { value: V; label: string }[];
  onChange: (v: V) => void;
  label: string;
}) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-field border py-2 text-sm font-semibold",
            value === o.value ? "border-iron bg-iron text-iron-fg" : "border-line text-steel hover:border-iron",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Quantity, unit, aisle and price for one grocery item. */
export function ItemFields({
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

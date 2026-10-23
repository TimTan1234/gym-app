"use client";

import { useState } from "react";
import { Input, cn } from "@/components/ui";

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
  /** Called with the final value. */
  onBlur?: (v: number | null) => void;
}) {
  const [typed, setTyped] = useState<string | null>(null);
  const inRange = (n: number) => Number.isFinite(n) && n >= min && (max === undefined || n <= max);
  const clamp = (n: number) => Math.max(min, max === undefined ? n : Math.min(max, n));

  return (
    <label className={cn("flex min-w-0 flex-col gap-0.5 text-[11px] font-medium text-steel", className)}>
      {label}
      <Input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={typed ?? value ?? ""}
        placeholder={placeholder}
        aria-label={ariaLabel}
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
            "rounded-[10px] border py-2 text-sm font-semibold",
            value === o.value ? "border-iron bg-iron text-iron-fg" : "border-line text-steel hover:border-iron",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

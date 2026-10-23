"use client";

import type { ReactNode } from "react";
import type { GroceryCategory } from "@/lib/ai/schemas";
import { formatAmount } from "@/lib/procurement/summary";
import { cn } from "@/components/ui";
import { useT } from "@/i18n/client";

/** The list as a till slip: paper on chalk, torn along the foot (see .slip). */
export function Slip({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("slip px-4 pt-1", className)}>{children}</div>;
}

/** An aisle's name and what it adds up to, above a dashed tear line. */
export function AisleHeading({ category, subtotal }: { category: GroceryCategory; subtotal: number }) {
  const t = useT();
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-line pb-1.5 pt-5">
      <h2 className="display text-[16px] text-steel">{t(`labels.groceryCategory.${category}`)}</h2>
      {subtotal > 0 && <span className="num text-[13px] text-steel">{formatAmount(subtotal, t.locale)}</span>}
    </div>
  );
}

/**
 * A price in the slip's right-hand column: what was paid, printed solid, or an
 * estimate marked ≈ in steel.
 */
export function PriceText({ paid, estimate }: { paid: number | null; estimate: number | null }) {
  const t = useT();
  if (paid != null) return <span className="num font-semibold text-iron">{formatAmount(paid, t.locale)}</span>;
  if (estimate != null) return <span className="num text-steel">≈ {formatAmount(estimate, t.locale)}</span>;
  return <span className="text-steel">–</span>;
}

/**
 * The screen's one emphasised panel, docked above the tab bar (like the rest
 * timer): the running count on the left, the total on the right.
 */
export function Tally({ children, className, testId }: { children: ReactNode; className?: string; testId?: string }) {
  return (
    <div
      data-testid={testId}
      className={cn(
        "fixed inset-x-4 bottom-20 z-30 mx-auto max-w-md rounded-[14px] bg-panel px-4 py-3 text-panel-fg shadow-[0_10px_30px_-12px_rgba(31,34,38,0.6)] md:bottom-6 md:left-60 lg:right-[max(1rem,calc((100vw-56rem)/2))]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A thin bar for the panel: how much of the list is in the basket. */
export function TallyBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-panel-fg/15" aria-hidden>
      <div className="h-full rounded-full bg-panel-fg transition-[width] duration-300" style={{ width: `${pct}%` }} />
    </div>
  );
}

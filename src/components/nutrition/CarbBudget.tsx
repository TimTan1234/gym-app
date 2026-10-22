"use client";

import { giBand } from "@/lib/nutrition/diabetes";
import { Badge, cn } from "@/components/ui";
import { useT } from "@/i18n/client";

/** "72 g carbs, budget 60–90 g", or how far over the top of the range. */
export function CarbBudgetLine({ carbs, range, className }: { carbs: number; range: { min: number; max: number }; className?: string }) {
  const t = useT();
  const g = Math.round(carbs);
  const over = g - range.max;
  return (
    <span className={cn("num text-[13px]", over > 0 ? "font-semibold text-iron" : "text-steel", className)} data-testid="carb-budget">
      {over > 0 ? t("glucose.carbs.over", { carbs: g, over, max: range.max }) : t("glucose.carbs.budget", { carbs: g, min: range.min, max: range.max })}
    </span>
  );
}

/** A food's GI band (CPG Appendix 4), as words. */
export function GiTag({ gi }: { gi: number | null }) {
  const t = useT();
  const band = giBand(gi);
  if (!band) return null;
  return <Badge className={cn(band === "high" && "font-semibold text-iron")}>{t(`glucose.gi.${band}`)}</Badge>;
}

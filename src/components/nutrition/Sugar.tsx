"use client";

import { cn } from "@/components/ui";
import { useT } from "@/i18n/client";

/** A meal with this much sugar uses half of the WHO's 50 g a day on its own. */
export const HIGH_SUGAR_MEAL_G = 25;

/** WHO: keep (free) sugars under 10% of energy; 4 kcal per gram. */
export const sugarGuideG = (targetKcal: number) => Math.round((targetKcal * 0.1) / 4);

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

/** "Sugar 12 g", with "high" spelled out (not only coloured) past the meal threshold. */
export function SugarAmount({ g, high = false, className }: { g: number; high?: boolean; className?: string }) {
  const t = useT();
  return (
    <span className={cn("num text-[13px]", high ? "font-semibold text-alert" : "text-steel", className)}>
      {t(high ? "nutrition.sugarHigh" : "nutrition.sugarAmount", { g: fmt(g) })}
    </span>
  );
}

/** The day's sugar against the guide, as a thin meter under the macros. */
export function SugarMeter({ g, targetKcal }: { g: number; targetKcal: number }) {
  const t = useT();
  const guide = sugarGuideG(targetKcal);
  const over = g > guide;
  const pct = Math.min(100, (g / Math.max(guide, 1)) * 100);
  return (
    <div className="space-y-1.5" data-testid="sugar-meter">
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="font-medium text-steel">{t("nutrition.sugar")}</span>
        <span className="num">
          <span className={cn("font-semibold", over && "text-alert")}>{fmt(g)}</span>
          <span className="text-steel"> {t("nutrition.sugarGuide", { guide: fmt(guide) })}</span>
        </span>
      </div>
      <div
        role="meter"
        aria-label={t("nutrition.sugar")}
        aria-valuemin={0}
        aria-valuemax={guide}
        aria-valuenow={Math.round(g)}
        aria-valuetext={t(over ? "nutrition.sugarOver" : "nutrition.sugarLeft", { g: fmt(Math.abs(guide - g)) })}
        className="h-[6px] overflow-hidden rounded-full bg-line"
      >
        <div className={cn("h-full rounded-full", over ? "bg-alert" : "bg-iron")} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-steel">
        {over ? <span className="font-medium text-alert">{t("nutrition.sugarOver", { g: fmt(g - guide) })}. </span> : null}
        {t("nutrition.sugarNote")}
      </p>
    </div>
  );
}

"use client";

import { cn } from "@/components/ui";
import { useT } from "@/i18n/client";

/** A meal with this much added sugar uses half of the WHO's 50 g a day on its own. */
export const HIGH_SUGAR_MEAL_G = 25;

/** WHO: keep free (added) sugars under 10% of energy; 4 kcal per gram. */
export const sugarGuideG = (targetKcal: number) => Math.round((targetKcal * 0.1) / 4);

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

/**
 * "Sugar 35 g, 30 g added": total sugar, then the added part when there is any.
 * "high" is spelled out (not only coloured) past the meal threshold.
 */
export function SugarAmount({ total, added, high = false, className }: { total: number; added: number; high?: boolean; className?: string }) {
  const t = useT();
  const vars = { total: fmt(total), added: fmt(added) };
  const text = high ? t("nutrition.sugarAddedHigh", vars) : Math.round(added) > 0 ? t("nutrition.sugarAdded", vars) : t("nutrition.sugarAmount", vars);
  return <span className={cn("num text-[13px]", high ? "font-semibold text-alert" : "text-steel", className)}>{text}</span>;
}

/** The day's added sugar against the guide, as a thin meter under the macros. */
export function SugarMeter({ added, total, targetKcal }: { added: number; total: number; targetKcal: number }) {
  const t = useT();
  const guide = sugarGuideG(targetKcal);
  const over = added > guide;
  const pct = Math.min(100, (added / Math.max(guide, 1)) * 100);
  return (
    <div className="space-y-1.5" data-testid="sugar-meter">
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="font-medium text-steel">{t("nutrition.addedSugar")}</span>
        <span className="num">
          <span className={cn("font-semibold", over && "text-alert")}>{fmt(added)}</span>
          <span className="text-steel"> {t("nutrition.sugarGuide", { guide: fmt(guide) })}</span>
        </span>
      </div>
      <div
        role="meter"
        aria-label={t("nutrition.addedSugar")}
        aria-valuemin={0}
        aria-valuemax={guide}
        aria-valuenow={Math.round(added)}
        aria-valuetext={t(over ? "nutrition.sugarOver" : "nutrition.sugarLeft", { g: fmt(Math.abs(guide - added)) })}
        className="h-[6px] overflow-hidden rounded-full bg-line"
      >
        <div className={cn("h-full rounded-full", over ? "bg-alert" : "bg-iron")} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-steel">
        {over ? <span className="font-medium text-alert">{t("nutrition.sugarOver", { g: fmt(added - guide) })}. </span> : null}
        {t("nutrition.sugarNote", { total: fmt(total) })}
      </p>
    </div>
  );
}

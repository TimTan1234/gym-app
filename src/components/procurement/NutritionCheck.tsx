"use client";

import type { Nutrients } from "@/lib/nutrition/totals";
import { nutritionCheck, type CheckProfile, type MacroKey, type TargetStatus } from "@/lib/procurement/summary";
import { ProgressBar, cn } from "@/components/ui";
import { useT } from "@/i18n/client";

const COLORS: Record<MacroKey, string> = {
  kcal: "var(--iron)",
  proteinG: "var(--plate-blue)",
  carbsG: "var(--plate-yellow)",
  fatG: "var(--plate-red)",
};

const LABELS = { kcal: "common.kcal", proteinG: "common.protein", carbsG: "common.carbs", fatG: "common.fat" } as const;

/** What the plan gives a day against the user's daily targets, plus any warnings. */
export function NutritionCheck({ perDay, profile, compact = false }: { perDay: Nutrients; profile: CheckProfile; compact?: boolean }) {
  const t = useT();
  const { rows, flags, carbDailyMax } = nutritionCheck(perDay, profile);
  const statusText = (s: TargetStatus) => t(`procurement.nutrition.status.${s}`);

  return (
    <div className="space-y-3" data-testid="nutrition-check">
      <ul className={cn("grid gap-3", compact ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-1")}>
        {rows.map((r) => (
          <li key={r.key} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium">{t(LABELS[r.key])}</span>
              <span className="num text-steel">
                {Math.round(r.value)} / {r.target}
                {r.key === "kcal" ? "" : " g"}
              </span>
            </div>
            <ProgressBar value={r.value} max={r.target} color={COLORS[r.key]} />
            {!compact && <p className={cn("text-xs", r.status === "ok" ? "text-steel" : "font-semibold text-iron")}>{statusText(r.status)}</p>}
          </li>
        ))}
      </ul>
      {flags.length > 0 && (
        <ul className="space-y-1 text-[13px]">
          {flags.map((f) => (
            <li key={f} className="font-semibold text-alert">
              {t(`procurement.nutrition.flags.${f}`, { max: carbDailyMax ?? 0, sugar: Math.round(perDay.addedSugarG) })}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

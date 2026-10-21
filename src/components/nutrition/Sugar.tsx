"use client";

import { cn } from "@/components/ui";
import { useT } from "@/i18n/client";

/** A meal with this much added sugar uses half of the WHO's 50 g a day on its own. */
export const HIGH_SUGAR_MEAL_G = 25;

/** WHO: keep free (added) sugars under 10% of energy; 4 kcal per gram. */
export const sugarGuideG = (targetKcal: number) => Math.round((targetKcal * 0.1) / 4);

/** One cube is a level teaspoon of sugar, the unit sugar advice is usually given in. */
export const TEASPOON_G = 4;

/** Past this many cubes the row stops growing and the rest is counted in text. */
const MAX_CUBES = 40;

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

const CUBE = {
  filled: "bg-current",
  empty: "border border-line",
  outline: "border border-current",
  // Past the guide: hatched ink, as past the calorie target on the barbell.
  over: "hatch border border-current",
} as const;

/** A small sugar cube. */
function Cube({ variant }: { variant: keyof typeof CUBE }) {
  return <span aria-hidden className={cn("inline-block size-[9px] shrink-0 rounded-[2px]", CUBE[variant])} />;
}

/**
 * A meal's sugar in one short tag. Added sugar is the figure that matters, so
 * it leads; "high" is spelled out and the cube filled, never shown in a plate colour.
 */
export function SugarTag({ total, added, high = false }: { total: number; added: number; high?: boolean }) {
  const t = useT();
  if (Math.round(added) <= 0 && Math.round(total) <= 0) return null;
  const text =
    Math.round(added) > 0
      ? t(high ? "nutrition.addedSugarTagHigh" : "nutrition.addedSugarTag", { added: fmt(added) })
      : t("nutrition.sugarAmount", { total: fmt(total) });
  return (
    <span className={cn("num inline-flex items-center gap-1.5 text-[13px]", high ? "font-semibold text-iron" : "text-steel")}>
      <Cube variant={high ? "filled" : "outline"} />
      {text}
    </span>
  );
}

/** An item's sugar in full: total, then the added part. */
export function SugarAmount({ total, added }: { total: number; added: number }) {
  const t = useT();
  const vars = { total: fmt(total), added: fmt(added) };
  return <span className="num text-[13px] text-steel">{Math.round(added) > 0 ? t("nutrition.sugarAdded", vars) : t("nutrition.sugarAmount", vars)}</span>;
}

/**
 * The day's added sugar as a row of teaspoon cubes. The collar marks the guide,
 * as it marks the calorie target on the barbell, and cubes past it are hatched.
 */
export function SugarMeter({ added, total, targetKcal }: { added: number; total: number; targetKcal: number }) {
  const t = useT();
  const guide = sugarGuideG(targetKcal);
  const guideCubes = Math.max(1, Math.round(guide / TEASPOON_G));
  const eatenCubes = Math.round(added / TEASPOON_G);
  const shown = Math.min(Math.max(guideCubes, eatenCubes), MAX_CUBES);
  const hidden = Math.max(eatenCubes, guideCubes) - shown;
  const over = added > guide;
  const tsp = Math.round(added / TEASPOON_G);

  const cubes = Array.from({ length: shown }, (_, i) => (
    <Cube key={i} variant={i >= eatenCubes ? "empty" : i < guideCubes ? "filled" : "over"} />
  ));
  // The collar sits after the guide's last cube.
  if (guideCubes <= shown) cubes.splice(guideCubes, 0, <span key="collar" aria-hidden className="mx-0.5 h-4 w-[3px] shrink-0 rounded-[2px] bg-iron" />);

  return (
    <div className="space-y-2" data-testid="sugar-meter">
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="font-medium text-steel">{t("nutrition.addedSugar")}</span>
        <span className="num">
          <span className="font-semibold">{t("nutrition.sugarTeaspoons", { g: fmt(added), tsp })}</span>
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
        className="flex flex-wrap items-center gap-[3px] text-iron"
      >
        {cubes}
        {hidden > 0 && <span className="num ml-1 text-xs font-semibold">+{hidden}</span>}
      </div>
      <p className="text-xs text-steel">
        {over && (
          <span className="font-semibold text-iron">
            {t("nutrition.sugarOver", { g: fmt(added - guide) })}
            {t.locale === "zh" ? "。" : ". "}
          </span>
        )}
        {t("nutrition.sugarNote", { total: fmt(total) })}
      </p>
    </div>
  );
}

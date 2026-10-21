"use client";

// A client component only so it can read the language from context; it has no state.
import type { Nutrients } from "@/lib/nutrition/totals";
import { Plate, cn } from "@/components/ui";
import { useT } from "@/i18n/client";
import { SugarMeter } from "./Sugar";

interface Targets {
  targetKcal: number;
  targetProteinG: number;
  targetCarbsG: number;
  targetFatG: number;
}

const MACROS = [
  { key: "proteinG", target: "targetProteinG", label: "common.protein", color: "var(--plate-blue)", kcalPerG: 4 },
  { key: "carbsG", target: "targetCarbsG", label: "common.carbs", color: "var(--plate-yellow)", kcalPerG: 4 },
  { key: "fatG", target: "targetFatG", label: "common.fat", color: "var(--plate-red)", kcalPerG: 9 },
] as const;

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

/**
 * The day's intake as a loaded barbell: each macro is a plate whose width is
 * the calories it contributed; the collar marks the calorie target; anything
 * past the collar is hatched.
 */
function Barbell({ totals, target, compact }: { totals: Nutrients; target: number; compact: boolean }) {
  const t = useT();
  const eaten = totals.kcal;
  const scale = Math.max(target * 1.12, eaten, 1);
  const collarPct = (target / scale) * 100;
  const macroKcal = MACROS.map((m) => totals[m.key] * m.kcalPerG);
  const macroSum = macroKcal.reduce((a, b) => a + b, 0) || 1;
  // Plates share the eaten calories in proportion to their macro calories.
  const widths = macroKcal.map((k) => ((k / macroSum) * eaten * 100) / scale);
  const overPct = eaten > target ? ((eaten - target) / scale) * 100 : 0;
  const h = compact ? 34 : 46;

  const label = t("nutrition.barLabel", {
    eaten: fmt(eaten),
    target: fmt(target),
    macros: MACROS.map((m, i) => t("nutrition.macroKcal", { macro: t(m.label).toLowerCase(), kcal: fmt(macroKcal[i]) })).join(t.locale === "zh" ? "，" : ", "),
  });

  return (
    <div role="img" aria-label={label} className="relative w-full" style={{ height: h + 10 }}>
      {/* bar */}
      <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-line" />
      {/* plates */}
      <div className="absolute inset-y-[5px] left-0 flex gap-[2px]" style={{ width: `${(eaten / scale) * 100}%` }}>
        {MACROS.map((m, i) =>
          widths[i] > 0 ? (
            <div
              key={m.key}
              title={t("nutrition.macroKcal", { macro: t(m.label), kcal: fmt(macroKcal[i]) })}
              className="h-full rounded-[4px]"
              style={{ flexGrow: widths[i], flexBasis: 0, minWidth: 3, background: m.color }}
            />
          ) : null,
        )}
      </div>
      {overPct > 0 && (
        <div
          className="hatch absolute inset-y-[5px] rounded-r-[4px] opacity-60"
          style={{ left: `${collarPct}%`, width: `${overPct}%` }}
        />
      )}
      {/* collar at the target */}
      <div
        className="absolute top-0 h-full w-[5px] -translate-x-1/2 rounded-[2px] bg-iron"
        style={{ left: `${collarPct}%` }}
        title={t("nutrition.targetKcal", { kcal: fmt(target) })}
      />
    </div>
  );
}

export function MacroSummary({ totals, targets, compact = false }: { totals: Nutrients; targets: Targets; compact?: boolean }) {
  const t = useT();
  const remaining = Math.round(targets.targetKcal - totals.kcal);
  const over = remaining < 0;
  // Keep the number styled inside translated sentences: split the template at its placeholder.
  const [eatenBefore, eatenAfter] = t("nutrition.eaten").split("{kcal}");
  const [targetBefore, targetAfter] = t("nutrition.ofTarget").split("{kcal}");

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <p>
          <span className={cn("score block", compact ? "text-[56px]" : "text-[76px]")}>{fmt(Math.abs(remaining))}</span>
          <span className="mt-1 block text-sm text-steel">{over ? t("nutrition.kcalOver") : t("nutrition.kcalLeft")}</span>
        </p>
        <p className="pb-6 text-right text-sm text-steel">
          {eatenBefore}
          <span className="num font-semibold text-iron">{fmt(totals.kcal)}</span>
          {eatenAfter}
          <br />
          {targetBefore}
          <span className="num">{fmt(targets.targetKcal)}</span>
          {targetAfter}
        </p>
      </div>

      <Barbell totals={totals} target={targets.targetKcal} compact={compact} />

      <dl className="grid grid-cols-3 gap-3">
        {MACROS.map((m) => {
          const value = totals[m.key];
          const target = targets[m.target];
          const left = Math.round(target - value);
          return (
            <div key={m.key}>
              <dt className="flex items-center gap-1.5 text-[13px] font-medium text-steel">
                <Plate color={m.color} /> {t(m.label)}
              </dt>
              <dd className="mt-1">
                <span className="score text-[28px]">{fmt(value)}</span>
                <span className="num text-sm text-steel"> / {fmt(target)} g</span>
              </dd>
              <dd className="num text-xs text-steel">{left >= 0 ? t("nutrition.gLeft", { g: left }) : t("nutrition.gOver", { g: -left })}</dd>
            </div>
          );
        })}
      </dl>

      {!compact && (
        <>
          <SugarMeter g={totals.sugarG} targetKcal={targets.targetKcal} />
          <p className="num text-[13px] text-steel">{t("nutrition.micros", { fiber: fmt(totals.fiberG), sodium: fmt(totals.sodiumMg) })}</p>
        </>
      )}
    </div>
  );
}

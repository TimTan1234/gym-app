"use client";

import { Fragment } from "react";
import { cn } from "@/components/ui";
import { useT } from "@/i18n/client";
import { GRADES, nutriGrade, worstDrink, type DrinkNutrition, type NutriGrade } from "@/lib/nutrition/nutri-grade";

// B shares A's colour; its place on the scale tells them apart.
const FILL: Record<NutriGrade, string> = { A: "bg-good", B: "bg-good", C: "bg-carbs", D: "bg-alert" };

const fmt = (n: number, digits: number) => n.toLocaleString("en-US", { maximumFractionDigits: digits });

/**
 * The Nutri-Grade scale, A to D, with the drink's step lit: drawn from the app's own colours, not
 * HPB's artwork. The lit letter is 19px bold, large text, so it reads at AA on every fill in both themes.
 */
function GradeStrip({ grade, label }: { grade: NutriGrade; label: string }) {
  return (
    <span role="img" aria-label={label} className="inline-flex shrink-0 overflow-hidden rounded-field border border-line">
      {GRADES.map((g) => (
        <span
          key={g}
          aria-hidden
          className={cn(
            "grid size-[22px] place-items-center leading-none",
            g !== "A" && "border-l border-line",
            g === grade ? cn(FILL[g], "text-[19px] font-bold text-chalk") : "text-[12px] font-semibold text-steel/55",
          )}
        >
          {/* A 19px capital sits about 2px low in its line box. */}
          <span className={cn(g === grade && "-translate-y-0.5")}>{g}</span>
        </span>
      ))}
    </span>
  );
}

/** A drink's grade with the two values it was graded on; the one that set the grade is at full strength. */
export function NutriGradeDetail({ item, className }: { item: DrinkNutrition; className?: string }) {
  const t = useT();
  const graded = nutriGrade(item);
  if (!graded) return null;
  const { grade, decidedBy } = graded;
  const value = {
    sugar: <span className={cn(decidedBy === "sugar" && "text-iron")}>{t("nutrition.nutriGrade.sugar", { g: fmt(graded.sugarPer100Ml, 1) })}</span>,
    saturatedFat: (
      <span className={cn(decidedBy === "saturatedFat" && "text-iron")}>{t("nutrition.nutriGrade.saturatedFat", { g: fmt(graded.saturatedFatPer100Ml, 2) })}</span>
    ),
  };
  const figures = t("nutrition.nutriGrade.figures")
    .split(/\{(sugar|saturatedFat)\}/)
    .map((part, i) => <Fragment key={i}>{i % 2 ? value[part as keyof typeof value] : part}</Fragment>);
  return (
    <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1", className)}>
      <GradeStrip grade={grade} label={t("nutrition.nutriGrade.label", { grade })} />
      <span className="num min-w-0 text-[13px] text-steel">
        {figures}
        {decidedBy === "sweetener" && <span className="text-iron">{t("nutrition.nutriGrade.sweetener")}</span>}
      </span>
    </div>
  );
}

/** A meal's worst-graded drink, as the scale alone; nothing when the meal has no graded drink. */
export function MealNutriGrade({ items }: { items: readonly (DrinkNutrition & { name: string })[] }) {
  const t = useT();
  const worst = worstDrink(items);
  if (!worst) return null;
  return <GradeStrip grade={worst.grade} label={t("nutrition.nutriGrade.named", { name: worst.item.name, grade: worst.grade })} />;
}

"use client";

import { useT } from "@/i18n/client";
import { Plate, cn } from "@/components/ui";

/** Protein / carbs / fat as plate swatches + grams. */
export function MacroLine({ p, c, f, className }: { p: number; c: number; f: number; className?: string }) {
  const t = useT();
  const r = (n: number) => Math.round(n);
  return (
    <span className={cn("num inline-flex items-center gap-2.5 text-[13px] text-steel", className)}>
      <span className="sr-only">
        {t("common.protein")} {r(p)} g, {t("common.carbs")} {r(c)} g, {t("common.fat")} {r(f)} g
      </span>
      {[
        [p, "var(--plate-blue)"],
        [c, "var(--plate-yellow)"],
        [f, "var(--plate-red)"],
      ].map(([v, color], i) => (
        <span key={i} aria-hidden className="inline-flex items-center gap-1">
          <Plate color={color as string} className="h-3 w-[5px]" />
          {/* One unit for all three, in the same text run as the last number. */}
          {r(v as number)}
          {i === 2 ? " g" : ""}
        </span>
      ))}
    </span>
  );
}

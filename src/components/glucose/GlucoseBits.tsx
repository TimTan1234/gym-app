"use client";

import { AlertTriangle, ArrowDown, ArrowUp, Check, Clock } from "lucide-react";
import { HYPO_MMOL, toDisplay, unitLabel, type GlucoseStatus, type GlucoseUnit } from "@/lib/glucose";
import { cn } from "@/components/ui";
import { useT } from "@/i18n/client";

const STATUS_STYLE: Record<GlucoseStatus, { icon: typeof Check; className: string }> = {
  inTarget: { icon: Check, className: "text-good" },
  above: { icon: ArrowUp, className: "text-iron" },
  veryHigh: { icon: AlertTriangle, className: "text-alert" },
  low: { icon: ArrowDown, className: "text-alert" },
  severeLow: { icon: AlertTriangle, className: "text-alert" },
  early: { icon: Clock, className: "text-steel" },
};

/** A reading's status as an icon and words, never colour alone. */
export function StatusTag({ status, className }: { status: GlucoseStatus; className?: string }) {
  const t = useT();
  const { icon: Icon, className: tone } = STATUS_STYLE[status];
  return (
    <span className={cn("inline-flex items-center gap-1 text-[13px] font-semibold", tone, className)}>
      <Icon className="size-3.5" aria-hidden /> {t(`glucose.status.${status}`)}
    </span>
  );
}

/** A glucose value in the user's unit. */
export function GlucoseValue({ mmol, unit, className }: { mmol: number; unit: GlucoseUnit; className?: string }) {
  return (
    <span className={cn("num", className)}>
      {toDisplay(mmol, unit)} <span className="text-[0.6em] font-normal text-steel">{unitLabel(unit)}</span>
    </span>
  );
}

/**
 * What to do about a low reading, from the Malaysian CPG T2DM section 4.1.
 * Shown for every reading under 3.9 mmol/L, whatever medicine the user takes.
 */
export function HypoCard({ severe, unit }: { severe: boolean; unit: GlucoseUnit }) {
  const t = useT();
  const low = toDisplay(HYPO_MMOL, unit);
  const u = unitLabel(unit);
  return (
    <section role="alert" className="space-y-2 rounded-[14px] border-2 border-alert bg-paper p-4 text-sm" data-testid="hypo-card">
      <h2 className="display flex items-center gap-2 text-[20px] text-alert">
        <AlertTriangle className="size-5" aria-hidden /> {severe ? t("glucose.hypo.severeTitle") : t("glucose.hypo.title")}
      </h2>
      <ol className="list-decimal space-y-1 pl-5">
        <li className="font-semibold">{t("glucose.hypo.step1")}</li>
        <li>{t("glucose.hypo.step2", { low, unit: u })}</li>
        <li>{t("glucose.hypo.step3", { low, unit: u })}</li>
      </ol>
      <p>{t("glucose.hypo.acarbose")}</p>
      <p className="font-semibold">{t("glucose.hypo.emergency")}</p>
      <p className="text-xs text-steel">
        {t("glucose.hypo.signs")} {t("glucose.hypo.source")}
      </p>
    </section>
  );
}

export function HighCard() {
  const t = useT();
  return (
    <section role="alert" className="space-y-1 rounded-[14px] border border-alert/60 bg-paper p-4 text-sm" data-testid="high-card">
      <h2 className="display flex items-center gap-2 text-[18px]">
        <AlertTriangle className="size-5 text-alert" aria-hidden /> {t("glucose.high.title")}
      </h2>
      <p>{t("glucose.high.body")}</p>
    </section>
  );
}

/** The safety card a status calls for, if any. */
export function SafetyCard({ status, unit }: { status: GlucoseStatus; unit: GlucoseUnit }) {
  if (status === "low" || status === "severeLow") return <HypoCard severe={status === "severeLow"} unit={unit} />;
  if (status === "veryHigh") return <HighCard />;
  return null;
}

import Link from "next/link";
import { dayStatus, type CycleToday, type PeriodRow, type Prediction } from "@/lib/cycle/predict";
import { isBuiltInSymptom } from "@/lib/cycle/symptoms";
import { addDays, dateRange, formatLocalDate } from "@/lib/dates";
import { cn, segmentClass, segmentTrack } from "@/components/ui";
import type { T } from "@/i18n/translate";

/** A built-in symptom in the user's language; a custom one as they typed it. */
export function symptomLabel(t: T, name: string) {
  return isBuiltInSymptom(name) ? t(`cycle.symptom.${name}`) : name;
}

/** "Period in ~9 days (Nov 14)", "Period day 2", or "Period late by 3 days". */
export function countdownText(t: T, now: CycleToday, prediction: Prediction, intl: string) {
  if (now.periodDay !== null) return t("cycle.today.periodDay", { day: now.periodDay });
  if (now.daysUntilNext === 0) return t("cycle.today.periodDue");
  if (now.daysUntilNext < 0) return t.plural("cycle.today.late", -now.daysUntilNext);
  return t.plural("cycle.today.periodIn", now.daysUntilNext, { date: formatLocalDate(prediction.nextStart, { weekday: undefined }, intl) });
}

/** Overview | History, under the page header. */
export function CycleTabs({ t, active }: { t: T; active: "overview" | "history" }) {
  return (
    <nav aria-label={t("cycle.views")} className={segmentTrack()}>
      <Link href="/cycle" aria-current={active === "overview" ? "page" : undefined} className={segmentClass(active === "overview")}>
        {t("cycle.overview")}
      </Link>
      <Link href="/cycle/history" aria-current={active === "history" ? "page" : undefined} className={segmentClass(active === "history")}>
        {t("cycle.history")}
      </Link>
    </nav>
  );
}

/** The days of the current cycle, from the last start to the predicted next one (or today, if later). */
export function currentCycleDays(prediction: Prediction, today: string) {
  const end = addDays(prediction.nextStart, -1);
  return dateRange(prediction.lastStart, today > end ? today : end);
}

/**
 * The current cycle as a row of cells: period red, fertile window blue, ovulation
 * solid blue, today ringed. Decorative: the text beside it says the same in words.
 */
export function CycleStrip({ prediction, periods, today, showFertile }: { prediction: Prediction; periods: PeriodRow[]; today: string; showFertile: boolean }) {
  const days = currentCycleDays(prediction, today);
  return (
    <div aria-hidden className="flex h-7 items-stretch gap-[2px]">
      {days.map((d) => {
        const s = dayStatus(d, prediction, periods);
        return (
          <span
            key={d}
            className={cn(
              "flex-1 rounded-[2px]",
              s.logged ? "bg-period" : s.predicted ? "bg-period/25" : showFertile && s.ovulation ? "bg-fertile" : showFertile && s.fertile ? "bg-fertile/25" : "bg-wash",
              d === today ? "outline-2 outline-offset-1 outline-iron" : "my-1.5",
            )}
          />
        );
      })}
    </div>
  );
}

/** Legend dot matching the calendar cells. */
export function LegendKey({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-steel">
      <span aria-hidden className={cn("inline-block h-3 w-5 rounded-full", className)} />
      {label}
    </span>
  );
}

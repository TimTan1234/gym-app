import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { dayStatus, type PeriodRow, type Prediction } from "@/lib/cycle/predict";
import { addDays, daysBetween, formatLocalDate, startOfWeek } from "@/lib/dates";
import { cn, tonalIconClass } from "@/components/ui";
import { LegendKey } from "./CycleBits";
import type { T } from "@/i18n/translate";

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
/** How far ahead the calendar shows predictions. */
const MONTHS_AHEAD = 6;

export function shiftMonth(month: string, by: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

const MONDAY = "2024-01-01";

type Band = "period" | "predicted" | "fertile";

/** Ranges are drawn as capsules across a week row: solid logged period, dashed predicted, pale fertile window. */
const BAND_CLASS: Record<Band, string> = {
  period: "bg-period",
  predicted: "border-y border-dashed border-period bg-period/10",
  fertile: "bg-fertile/15",
};

/** A month of the cycle: logged and predicted periods, fertile window, ovulation; past days open their log. */
export function CycleCalendar({
  t,
  intl,
  month,
  today,
  periods,
  prediction,
  showFertile,
  loggedDates,
}: {
  t: T;
  intl: string;
  month: string;
  today: string;
  periods: PeriodRow[];
  prediction: Prediction | null;
  showFertile: boolean;
  loggedDates: Set<string>;
}) {
  const first = `${month}-01`;
  const last = addDays(`${shiftMonth(month, 1)}-01`, -1);
  const lead = daysBetween(startOfWeek(first), first);
  const cells: (string | null)[] = [...Array(lead).fill(null)];
  for (let d = first; d <= last; d = addDays(d, 1)) cells.push(d);
  const statuses = cells.map((d) => (d ? dayStatus(d, prediction, periods) : null));
  const bands: (Band | null)[] = statuses.map((st) =>
    !st ? null : st.logged ? "period" : st.predicted ? "predicted" : showFertile && (st.fertile || st.ovulation) ? "fertile" : null,
  );
  const thisMonth = today.slice(0, 7);
  const canNext = month < shiftMonth(thisMonth, MONTHS_AHEAD);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="display text-[22px]">{formatLocalDate(first, { weekday: undefined, day: undefined, month: "long", year: "numeric" }, intl)}</h3>
        <div className="flex gap-2">
          <Link href={`/cycle?month=${shiftMonth(month, -1)}`} aria-label={t("cycle.calendar.previous")} className={tonalIconClass} scroll={false}>
            <ChevronLeft className="size-5" />
          </Link>
          {canNext ? (
            <Link href={`/cycle?month=${shiftMonth(month, 1)}`} aria-label={t("cycle.calendar.next")} className={tonalIconClass} scroll={false}>
              <ChevronRight className="size-5" />
            </Link>
          ) : (
            <span aria-hidden className={cn(tonalIconClass, "opacity-40")}>
              <ChevronRight className="size-5" />
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center">
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i} aria-hidden className="pb-1 text-xs text-steel">
            {formatLocalDate(addDays(MONDAY, i), { weekday: "short", month: undefined, day: undefined }, intl)}
          </span>
        ))}
        {cells.map((date, i) => {
          if (!date) return <span key={`blank-${i}`} />;
          const s = statuses[i]!;
          const band = bands[i];
          // A range runs on from the day before and into the day after within the same week row.
          const joinsLeft = band !== null && i % 7 !== 0 && bands[i - 1] === band;
          const joinsRight = band !== null && i % 7 !== 6 && bands[i + 1] === band;
          const ovulation = showFertile && s.ovulation;
          const words = [
            s.logged && t("cycle.calendar.period"),
            s.predicted && t("cycle.calendar.predicted"),
            ovulation && t("cycle.calendar.ovulation"),
            band === "fertile" && !ovulation && t("cycle.calendar.fertile"),
            loggedDates.has(date) && t("cycle.calendar.logged"),
            date === today && t("cycle.calendar.today"),
          ].filter(Boolean);
          const label = [formatLocalDate(date, undefined, intl), ...words].join(", ");
          const content = (
            <>
              {band && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-y-1 left-0 right-0",
                    BAND_CLASS[band],
                    !joinsLeft && "left-1 rounded-l-full",
                    !joinsRight && "right-1 rounded-r-full",
                    band === "predicted" && !joinsLeft && "border-l",
                    band === "predicted" && !joinsRight && "border-r",
                  )}
                />
              )}
              <span
                className={cn(
                  "num relative grid size-9 place-items-center rounded-full text-sm",
                  band === "period" && "font-semibold text-chalk",
                  band === "predicted" && "text-period",
                  ovulation && "bg-chalk ring-2 ring-fertile",
                  date === today && "ring-2 ring-iron ring-offset-1 ring-offset-chalk",
                  date > today && band !== "predicted" && "text-steel",
                )}
              >
                {Number(date.slice(8))}
                {loggedDates.has(date) && <span aria-hidden className={cn("absolute bottom-0.5 size-1 rounded-full", band === "period" ? "bg-chalk" : "bg-steel")} />}
              </span>
            </>
          );
          const cell = "relative grid h-11 place-items-center";
          return date > today ? (
            <span key={date} className={cell} aria-label={label} role="img">
              {content}
            </span>
          ) : (
            <Link key={date} href={`/cycle/log?date=${date}`} className={cn(cell, "rounded-field active:bg-wash")} aria-label={label}>
              {content}
            </Link>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        <LegendKey className={cn(BAND_CLASS.period, "rounded-full")} label={t("cycle.calendar.period")} />
        <LegendKey className={cn(BAND_CLASS.predicted, "rounded-full border")} label={t("cycle.calendar.predicted")} />
        {showFertile && <LegendKey className={cn(BAND_CLASS.fertile, "rounded-full")} label={t("cycle.calendar.fertile")} />}
        {showFertile && <LegendKey className="w-3 ring-2 ring-inset ring-fertile" label={t("cycle.calendar.ovulation")} />}
      </div>
      <p className="text-xs text-steel">{t("cycle.calendar.hint")}</p>
    </div>
  );
}

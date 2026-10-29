import Link from "next/link";
import { Sparkles } from "lucide-react";
import type { CheckinResult } from "@/lib/nutrition/checkin";
import { describeMissing } from "@/lib/nutrition/checkin-text";
import { formatLocalDate } from "@/lib/dates";
import { displayWeight, weightUnit, type UnitSystem } from "@/lib/units";
import { buttonClass } from "@/components/ui";
import { ApplyCheckinButton } from "./ApplyCheckinButton";
import { getT } from "@/i18n/server";
import { INTL_LOCALE } from "@/i18n/config";

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

function signed(kg: number, units: UnitSystem) {
  const v = displayWeight(kg, units, 2);
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)} ${weightUnit(units)}`;
}

/** The emphasised panel on Progress: what the last two weeks say about your calorie target. */
export async function WeeklyCheckin({ checkin: c, targetKcal, units }: { checkin: CheckinResult; targetKcal: number; units: UnitSystem }) {
  const t = await getT();
  const intl = INTL_LOCALE[t.locale];
  const coachLink = (
    <Link
      href={`/coach?q=${encodeURIComponent(t("progress.checkin.coachQuestion"))}`}
      className={buttonClass(c.status === "adjust" ? "inverse-ghost" : "inverse")}
    >
      <Sparkles className="size-4" /> {t("progress.checkin.askCoach")}
    </Link>
  );

  return (
    <section className="space-y-4 rounded-card bg-panel p-5 text-panel-fg" aria-labelledby="checkin-title" data-testid="weekly-checkin">
      <div>
        <p className="text-sm opacity-70">
          {t("progress.checkin.window", {
            start: formatLocalDate(c.start, { weekday: undefined }, intl),
            end: formatLocalDate(c.end, { weekday: undefined }, intl),
          })}
        </p>
        <h2 id="checkin-title" className="display mt-1 text-[24px]">
          {c.status === "insufficient"
            ? t("progress.checkin.insufficient")
            : c.status === "on_track"
              ? t("progress.checkin.onTrack")
              : c.status === "waiting"
                ? t("progress.checkin.nextOn", { date: formatLocalDate(c.nextOn!, { weekday: "long", month: "short" }, intl) })
                : t("progress.checkin.change", { kcal: fmt(c.suggested!.kcal) })}
        </h2>
        {c.status === "waiting" && (
          <p className="mt-1 text-sm opacity-80">{t("progress.checkin.waitingBody")}</p>
        )}
        {c.status === "adjust" && (
          <p className="mt-1 text-sm opacity-80">
            {t("progress.checkin.from", {
              kcal: fmt(targetKcal),
              protein: c.suggested!.proteinG,
              carbs: c.suggested!.carbsG,
              fat: c.suggested!.fatG,
            })}
          </p>
        )}
      </div>

      {c.status === "insufficient" ? (
        <p className="text-sm opacity-80">
          {t("progress.checkin.stillNeeded", {
            items: c.missing.map((m) => describeMissing(t, m)).join(t("progress.checkin.listSeparator")),
          })}
        </p>
      ) : (
        <dl className="grid grid-cols-3 gap-3 border-t border-panel-fg/20 pt-3">
          <div>
            <dt className="text-xs opacity-70">{t("progress.checkin.eaten")}</dt>
            <dd className="score text-[26px]">{fmt(c.avgIntakeKcal!)}</dd>
            <dd className="text-xs opacity-70">{t("progress.checkin.kcalADay")}</dd>
          </div>
          <div>
            <dt className="text-xs opacity-70">{t("progress.checkin.weightTrend")}</dt>
            <dd className="score text-[26px]">{signed(c.weeklyChangeKg!, units)}</dd>
            <dd className="text-xs opacity-70">{t("progress.checkin.aWeek")}</dd>
            <dd className="text-xs opacity-70">{t("progress.checkin.goal", { value: signed(c.goalWeeklyChangeKg, units) })}</dd>
          </div>
          <div>
            <dt className="text-xs opacity-70">{t("progress.checkin.estimatedBurn")}</dt>
            <dd className="score text-[26px]">{fmt(c.estimatedTdee!)}</dd>
            <dd className="text-xs opacity-70">{t("progress.checkin.kcalADay")}</dd>
          </div>
        </dl>
      )}

      <div className="flex flex-wrap gap-2">
        {c.status === "adjust" && <ApplyCheckinButton kcal={c.suggested!.kcal} />}
        {coachLink}
      </div>
    </section>
  );
}

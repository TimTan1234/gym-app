import { Suspense } from "react";
import Link from "next/link";
import { CalendarHeart, ChevronRight, Plus, Sparkles } from "lucide-react";
import { requireProfile } from "@/lib/session";
import { db } from "@/lib/db";
import { addDays, formatLocalDate, todayLocal } from "@/lib/dates";
import { cycleEnabled, getCycleDays, getCycleState } from "@/lib/cycle-queries";
import { symptomForecast } from "@/lib/cycle/forecast";
import { isBuiltInSymptom } from "@/lib/cycle/symptoms";
import { CycleRing } from "@/components/cycle/CycleRing";
import { CycleCalendar, MONTH_RE, shiftMonth } from "@/components/cycle/CycleCalendar";
import { CycleTabs, countdownText, symptomLabel } from "@/components/cycle/CycleBits";
import { Badge, Card, EmptyState, PageHeader, PageSkeleton, Section, buttonClass, tonalIconClass } from "@/components/ui";
import { getT } from "@/i18n/server";
import { INTL_LOCALE } from "@/i18n/config";

export const metadata = { title: "Cycle" };

const FORECAST_WINDOW_DAYS = 365;
const RECENT_DAYS = 5;

async function Cycle({ searchParams }: { searchParams: PageProps<"/cycle">["searchParams"] }) {
  const { user, profile } = await requireProfile();
  const [sp, t] = await Promise.all([searchParams, getT()]);
  const intl = INTL_LOCALE[t.locale];

  if (!cycleEnabled(profile)) {
    return (
      <>
        <PageHeader title={t("cycle.title")} />
        <EmptyState
          title={t("cycle.off.title")}
          action={
            <Link href="/settings#cycle" className={buttonClass("secondary", "sm")}>
              {t("cycle.off.action")}
            </Link>
          }
        >
          {t("cycle.off.body")}
        </EmptyState>
      </>
    );
  }

  const today = todayLocal(profile.timezone);
  const requested = typeof sp.month === "string" && MONTH_RE.test(sp.month) ? sp.month : null;
  const month = requested ?? today.slice(0, 7);
  const [{ periods, prediction, now }, days, monthDays] = await Promise.all([
    getCycleState(user.id, profile, today),
    getCycleDays(user.id, addDays(today, -FORECAST_WINDOW_DAYS), today),
    db.cycleDay.findMany({ where: { userId: user.id, localDate: { gte: `${month}-01`, lt: `${shiftMonth(month, 1)}-01` } }, select: { localDate: true } }),
  ]);

  const header = (
    <div>
      <PageHeader
        title={t("cycle.title")}
        subtitle={t("cycle.subtitle")}
        action={
          <Link href={`/cycle/log?date=${today}`} aria-label={t("cycle.logDay")} className={tonalIconClass}>
            <Plus className="size-5" />
          </Link>
        }
      />
      <CycleTabs t={t} active="overview" />
    </div>
  );

  if (!prediction || !now) {
    return (
      <div className="space-y-8">
        {header}
        <EmptyState
          title={t("cycle.empty.title")}
          action={
            <Link href={`/cycle/log?date=${today}&start=1`} className={buttonClass("primary")}>
              <CalendarHeart className="size-5" /> {t("cycle.empty.action")}
            </Link>
          }
        >
          {t("cycle.empty.body")}
        </EmptyState>
      </div>
    );
  }

  const forecast = symptomForecast(periods, days, prediction, today);
  const recent = days.slice(-RECENT_DAYS).reverse();
  const shortDate = (d: string) => formatLocalDate(d, { weekday: undefined }, intl);

  return (
    <div className="space-y-8">
      {header}

      <Card className="flex flex-col items-center gap-6 p-6 sm:flex-row sm:p-8">
        <CycleRing t={t} prediction={prediction} periods={periods} today={today} now={now} showFertile={profile.showFertileWindow} />
        <div className="w-full min-w-0 space-y-2 text-center sm:text-left">
          {now.phase && <p className="display text-[26px]">{t(`cycle.phase.${now.phase}`)}</p>}
          {now.phase && <p className="text-sm text-steel">{t(`cycle.phaseNote.${now.phase}`)}</p>}
          <p className="pt-2 font-medium" data-testid="cycle-countdown">
            {countdownText(t, now, prediction, intl)}
          </p>
          <p className="text-sm text-steel">
            {/* During a period the countdown doesn't name the next start, so it's given here. */}
            {now.periodDay !== null && `${t("cycle.nextPeriod", { date: shortDate(prediction.nextStart) })} · `}
            {t.plural("cycle.plusMinus", prediction.uncertainty)} · {prediction.cycles === 0 ? t("cycle.basedOnSettings") : t.plural("cycle.basedOn", prediction.cycles)}
          </p>
          {prediction.tier === "low" && <p className="text-xs text-steel">{t("cycle.lowConfidence")}</p>}
        </div>
      </Card>

      {forecast.length > 0 && (
        <section className="space-y-3 rounded-card border border-line p-5">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="size-4 text-steel" aria-hidden /> {t("cycle.forecast.title")}
          </p>
          <ul className="space-y-3">
            {forecast.map((f) => {
              const symptom = symptomLabel(t, f.symptom).toLocaleLowerCase(intl);
              const message =
                f.offset < 0
                  ? t.plural("cycle.forecast.before", -f.offset, { symptom })
                  : f.offset === 0
                    ? t("cycle.forecast.onStart", { symptom })
                    : t("cycle.forecast.intoCycle", { symptom, day: f.offset + 1 });
              return (
                <li key={f.symptom} className="text-sm">
                  <p className="font-medium">{message}</p>
                  <p className="text-steel">{t(isBuiltInSymptom(f.symptom) ? `cycle.forecast.advice.${f.symptom}` : "cycle.forecast.advice.other")}</p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <Section title={t("cycle.calendar.title")}>
        <CycleCalendar
          t={t}
          intl={intl}
          month={month}
          today={today}
          periods={periods}
          prediction={prediction}
          showFertile={profile.showFertileWindow}
          loggedDates={new Set(monthDays.map((d) => d.localDate))}
        />
      </Section>

      <Section title={t("cycle.recent.title")}>
        {recent.length === 0 ? (
          <p className="text-sm text-steel">{t("cycle.recent.none")}</p>
        ) : (
          <ul className="border-t border-line">
            {recent.map((d) => (
              <li key={d.localDate} className="border-b border-line">
                <Link href={`/cycle/log?date=${d.localDate}`} prefetch={false} className="flex items-center gap-3 py-3 active:bg-wash" data-testid="cycle-recent-day">
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="block font-medium">{formatLocalDate(d.localDate, undefined, intl)}</span>
                    <span className="flex flex-wrap items-center gap-1.5 text-[13px] text-steel">
                      {d.flow && (
                        <span className="flex items-center gap-1">
                          <span aria-hidden className="inline-block size-2 rounded-full bg-period" /> {t(`cycle.flow.${d.flow}`)}
                        </span>
                      )}
                      {d.symptoms.slice(0, 2).map((s) => (
                        <Badge key={s.name}>
                          {symptomLabel(t, s.name)} · {t(`cycle.severity.${s.severity}`)}
                        </Badge>
                      ))}
                      {d.symptoms.length > 2 && <span>+{d.symptoms.length - 2}</span>}
                      {d.mood && <span>{t(`cycle.mood.${d.mood}`)}</span>}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-steel" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

export default function CyclePage(props: PageProps<"/cycle">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Cycle searchParams={props.searchParams} />
    </Suspense>
  );
}

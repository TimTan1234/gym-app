import { Suspense } from "react";
import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { requireProfile } from "@/lib/session";
import { daysBetween, formatLocalDate, todayLocal } from "@/lib/dates";
import { cycleEnabled, getCycleDays, getCycleState } from "@/lib/cycle-queries";
import { cycleInsights } from "@/lib/cycle/insights";
import { FLOWS } from "@/lib/cycle/symptoms";
import { CycleTabs, symptomLabel } from "@/components/cycle/CycleBits";
import { DeletePeriodButton } from "@/components/cycle/DeletePeriodButton";
import { CategoryBars, TrendChart } from "@/components/charts";
import { Badge, EmptyState, PageHeader, PageSkeleton, ProgressBar, Section, buttonClass, tonalIconClass } from "@/components/ui";
import { getT } from "@/i18n/server";
import { INTL_LOCALE } from "@/i18n/config";

export const metadata = { title: "Cycle history" };

/** The severity an average of 1-3 rounds to. */
function typicalSeverity(average: number) {
  return average < 1.5 ? "MILD" : average < 2.5 ? "MODERATE" : "SEVERE";
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-3 pr-3">
      <p className="text-xs text-steel">{label}</p>
      <p className="score mt-1 text-[30px]">{value}</p>
    </div>
  );
}

async function CycleHistory() {
  const { user, profile } = await requireProfile();
  const t = await getT();
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
  const { periods, prediction } = await getCycleState(user.id, profile, today);
  const days = await getCycleDays(user.id, periods[0]?.startDate ?? today, today);
  const periodLength = prediction?.periodLength ?? profile.periodLength;
  const stats = cycleInsights(periods, days, periodLength);
  const shortDate = (d: string) => formatLocalDate(d, { weekday: undefined }, intl);
  const dash = "–";
  const trend = stats.trend.filter((p) => p.length !== null).map((p) => ({ date: p.startDate, value: p.length }));
  const newestFirst = [...periods].reverse();

  return (
    <div className="space-y-10">
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
        <CycleTabs t={t} active="history" />
      </div>

      <div className="grid grid-cols-2 gap-x-4 border-y border-line [&>*:nth-child(2n)]:border-l [&>*:nth-child(2n)]:border-line [&>*:nth-child(2n)]:pl-4">
        <Stat label={t("cycle.stats.avgCycle")} value={stats.averageCycleLength === null ? dash : t("cycle.stats.daysValue", { value: stats.averageCycleLength })} />
        <Stat label={t("cycle.stats.avgPeriod")} value={stats.averagePeriodLength === null ? dash : t("cycle.stats.daysValue", { value: stats.averagePeriodLength })} />
        <Stat label={t("cycle.stats.variation")} value={stats.variability === null ? dash : t("cycle.stats.plusMinus", { value: stats.variability })} />
        <Stat label={t("cycle.stats.prediction")} value={prediction ? t("cycle.stats.plusMinus", { value: prediction.uncertainty }) : dash} />
        <Stat label={t("cycle.stats.cycles")} value={String(stats.trackedCycles)} />
        <Stat label={t("cycle.stats.days")} value={String(stats.trackedDays)} />
      </div>

      <section className="space-y-3">
        {trend.length >= 2 ? (
          <TrendChart title={t("cycle.trend.title")} data={trend} unit={t("cycle.trend.unit")} decimals={1} />
        ) : (
          <>
            <h2 className="text-sm font-semibold">{t("cycle.trend.title")}</h2>
            <p className="text-sm text-steel">{t("cycle.trend.needMore")}</p>
          </>
        )}
      </section>

      {FLOWS.some((f) => stats.flowCounts[f] > 0) && (
        <CategoryBars title={t("cycle.flowMix")} unit={t("cycle.stats.days")} data={FLOWS.map((f) => ({ label: t(`cycle.flow.${f}`), value: stats.flowCounts[f] }))} />
      )}

      <Section title={t("cycle.symptomPatterns.title")}>
        {stats.symptoms.length === 0 ? (
          <p className="text-sm text-steel">{t("cycle.symptomPatterns.none")}</p>
        ) : (
          <ul className="space-y-3">
            {stats.symptoms.map((s) => (
              <li key={s.name} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium">{symptomLabel(t, s.name)}</span>
                  <span className="text-steel">
                    {t("cycle.symptomPatterns.summary", {
                      days: t.plural("cycle.symptomPatterns.days", s.days),
                      severity: t(`cycle.severity.${typicalSeverity(s.averageSeverity)}`).toLocaleLowerCase(intl),
                    })}
                  </span>
                </div>
                {/* How often, against the most frequent symptom. */}
                <ProgressBar value={s.days} max={stats.symptoms[0].days} color="var(--steel)" />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t("cycle.periods.title")}>
        {newestFirst.length === 0 ? (
          <p className="text-sm text-steel">{t("cycle.periods.none")}</p>
        ) : (
          <ul className="border-t border-line">
            {newestFirst.map((p, i) => {
              const next = newestFirst[i - 1]?.startDate ?? null;
              const length = p.endDate ? daysBetween(p.startDate, p.endDate) + 1 : null;
              const cycle = next ? daysBetween(p.startDate, next) : null;
              const inCycle = days.filter((d) => d.localDate >= p.startDate && (next === null || d.localDate < next));
              const symptoms = [...new Set(inCycle.flatMap((d) => d.symptoms.map((s) => s.name)))];
              const range = `${shortDate(p.startDate)} – ${p.endDate ? shortDate(p.endDate) : t("cycle.periods.ongoing")}`;
              return (
                <li key={p.id} className="border-b border-line" data-testid="cycle-period">
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-3 py-3 [&::-webkit-details-marker]:hidden">
                      <span aria-hidden className="h-9 w-1.5 shrink-0 rounded-full bg-period" />
                      <span className="min-w-0 flex-1 space-y-1">
                        <span className="block font-medium">{range}</span>
                        <span className="block text-[13px] text-steel">
                          {length === null ? t("cycle.periods.ongoing") : t.plural("cycle.periods.length", length)}
                          {cycle !== null && ` · ${t("cycle.periods.cycleOf", { count: cycle })}`}
                        </span>
                        {symptoms.length > 0 && (
                          <span className="flex flex-wrap gap-1.5">
                            {symptoms.slice(0, 3).map((s) => (
                              <Badge key={s}>{symptomLabel(t, s)}</Badge>
                            ))}
                          </span>
                        )}
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-steel transition-transform group-open:rotate-90" aria-hidden />
                    </summary>
                    <div className="space-y-2 pb-4 pl-[18px]">
                      {inCycle.length > 0 && (
                        <>
                          <p className="text-xs font-medium text-steel">{t("cycle.periods.daysInCycle")}</p>
                          <ul className="flex flex-wrap gap-2">
                            {inCycle.map((d) => (
                              <li key={d.localDate}>
                                <Link href={`/cycle/log?date=${d.localDate}`} className={buttonClass("secondary", "sm")}>
                                  {shortDate(d.localDate)}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                      <div className="flex justify-end">
                        <DeletePeriodButton id={p.id} label={range} />
                      </div>
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}

export default function CycleHistoryPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CycleHistory />
    </Suspense>
  );
}

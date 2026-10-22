import { Suspense } from "react";
import Link from "next/link";
import { requireProfile } from "@/lib/session";
import { db } from "@/lib/db";
import { addDays, formatLocalDate, toLocalTime, todayLocal } from "@/lib/dates";
import { GLUCOSE_CONTEXTS, classifyReading, summarize, toDisplay, unitLabel, type GlucoseContext, type GlucoseTargets } from "@/lib/glucose";
import { GlucoseLogger } from "@/components/glucose/GlucoseLogger";
import { GlucoseValue, SafetyCard, StatusTag } from "@/components/glucose/GlucoseBits";
import { GlucoseStrip } from "@/components/glucose/GlucoseStrip";
import { RiseBar, riseScaleMax } from "@/components/glucose/RiseBar";
import { DeleteReadingButton } from "@/components/glucose/DeleteReadingButton";
import { mealResponses } from "@/lib/glucose-queries";
import { highGiCarbShare } from "@/lib/nutrition/diabetes";
import { Card, EmptyState, PageHeader, PageSkeleton, Section, buttonClass } from "@/components/ui";
import { getT } from "@/i18n/server";
import { INTL_LOCALE } from "@/i18n/config";

export const metadata = { title: "Glucose" };

const WINDOW_DAYS = 14;

async function Glucose({ searchParams }: { searchParams: PageProps<"/glucose">["searchParams"] }) {
  const { user, profile } = await requireProfile();
  const [sp, t] = await Promise.all([searchParams, getT()]);
  const intl = INTL_LOCALE[t.locale];
  const zh = t.locale === "zh";

  if (!profile.diabetesMode) {
    return (
      <>
        <PageHeader title={t("glucose.title")} />
        <EmptyState
          title={t("glucose.off.title")}
          action={
            <Link href="/settings#diabetes" className={buttonClass("secondary", "sm")}>
              {t("glucose.off.action")}
            </Link>
          }
        >
          {t("glucose.off.body")}
        </EmptyState>
      </>
    );
  }

  const tz = profile.timezone;
  const unit = profile.glucoseUnit;
  const today = todayLocal(tz);
  const targets: GlucoseTargets = { fastingMin: profile.glucoseFastingMin, fastingMax: profile.glucoseFastingMax, postMealMax: profile.glucosePostMealMax };

  const [readings, todaysMeals, responses] = await Promise.all([
    db.glucoseReading.findMany({
      where: { userId: user.id, localDate: { gte: addDays(today, -(WINDOW_DAYS - 1)) } },
      // Ties (same minute) go to the reading logged last.
      orderBy: [{ measuredAt: "desc" }, { createdAt: "desc" }],
      include: { meal: { select: { description: true, eatenAt: true } } },
    }),
    db.meal.findMany({ where: { userId: user.id, localDate: today }, orderBy: { eatenAt: "asc" }, select: { id: true, description: true, eatenAt: true } }),
    mealResponses(user.id, addDays(today, -(WINDOW_DAYS - 1)), profile),
  ]);

  const rated = readings.map((r) => {
    const minutesAfterMeal = r.meal ? Math.round((r.measuredAt.getTime() - r.meal.eatenAt.getTime()) / 60000) : null;
    return { ...r, minutesAfterMeal, status: classifyReading({ mmol: r.mmol, context: r.context, minutesAfterMeal }, targets) };
  });
  const summary = summarize(rated.map((r) => r.status));
  const latest = rated[0];
  // Today and yesterday in full; the strip sums up the rest, which folds away.
  const byDay = [...Map.groupBy(rated, (r) => r.localDate)];
  const recentDays = byDay.filter(([date]) => date >= addDays(today, -1));
  const olderDays = byDay.filter(([date]) => date < addDays(today, -1));

  const initialContext = GLUCOSE_CONTEXTS.find((c) => c === sp.context) ?? null;
  const initialMealId = typeof sp.meal === "string" ? sp.meal : null;
  const fmt = (mmol: number) => toDisplay(mmol, unit);
  const dayLabel = (date: string) => (date === today ? t("glucose.today") : formatLocalDate(date, undefined, intl));
  const contextLabel = (r: (typeof rated)[number]) =>
    r.meal ? t("glucose.afterMeal", { meal: r.meal.description }) : t(`glucose.context.${r.context}`);
  const minuteOf = (d: Date) => {
    const [h, m] = toLocalTime(d, tz).split(":").map(Number);
    return h * 60 + m;
  };
  const readingList = (list: typeof rated) => (
    <ul className="divide-y divide-line border-y border-line">
      {list.map((r) => {
        const time = toLocalTime(r.measuredAt, tz);
        return (
          <li key={r.id} className="flex items-center gap-3 py-2.5" data-testid="glucose-reading">
            <span className="num w-12 shrink-0 text-sm text-steel">{time}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{contextLabel(r)}</p>
              <StatusTag status={r.status} />
              {r.note && <p className="text-xs text-steel">{r.note}</p>}
            </div>
            <GlucoseValue mmol={r.mmol} unit={unit} className="score text-[24px]" />
            <DeleteReadingButton id={r.id} time={time} />
          </li>
        );
      })}
    </ul>
  );
  const responseScale = riseScaleMax(responses.map((r) => r.afterMmol), targets);

  return (
    <div className="space-y-7">
      <PageHeader
        title={t("glucose.title")}
        subtitle={t("glucose.target", { min: fmt(targets.fastingMin), max: fmt(targets.fastingMax), post: fmt(targets.postMealMax), unit: unitLabel(unit) })}
      />

      {/* A recent low or very high reading keeps its card on screen until a newer reading. */}
      {latest && latest.localDate === today && <SafetyCard status={latest.status} unit={unit} />}

      {rated.length > 0 && (
        <div className="space-y-2">
          <GlucoseStrip
            unit={unit}
            targets={targets}
            points={rated.toReversed().map((r) => ({
              id: r.id,
              minute: minuteOf(r.measuredAt),
              mmol: r.mmol,
              status: r.status,
              today: r.localDate === today,
              label: contextLabel(r),
              day: dayLabel(r.localDate),
              time: toLocalTime(r.measuredAt, tz),
            }))}
            meals={todaysMeals.map((m) => ({
              id: m.id,
              minute: minuteOf(m.eatenAt),
              readingIds: rated.filter((r) => r.mealId === m.id && r.localDate === today).map((r) => r.id),
            }))}
          />
          <p className="text-sm">
            <span className="text-steel">
              {t("glucose.summaryWindow")}
              {zh ? "：" : ": "}
            </span>
            <span className="font-semibold" data-testid="glucose-summary">
              {t("glucose.summary", { inTarget: summary.inTarget, rated: summary.rated })}
            </span>
            {summary.low > 0 && <span className="font-semibold text-alert">{zh ? "，" : ", "}{t("glucose.lows", { count: summary.low })}</span>}
          </p>
        </div>
      )}

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold">{t("glucose.log.title")}</h2>
        <GlucoseLogger
          key={`${initialContext ?? ""}:${initialMealId ?? ""}`}
          unit={unit}
          timezone={tz}
          today={today}
          nowTime={toLocalTime(new Date(), tz)}
          meals={todaysMeals.map((m) => ({ id: m.id, description: m.description, time: toLocalTime(m.eatenAt, tz), eatenAtMs: m.eatenAt.getTime() }))}
          initialContext={initialContext as GlucoseContext | null}
          initialMealId={initialMealId}
        />
      </Card>

      {rated.length === 0 ? (
        <p className="text-sm text-steel">{t("glucose.noReadings")}</p>
      ) : (
        <>
          <Section title={t("glucose.responses.title")}>
            {responses.length === 0 ? (
              <p className="text-sm text-steel">{t("glucose.responses.empty")}</p>
            ) : (
              <ul className="divide-y divide-line border-y border-line" data-testid="meal-responses">
                {responses.map((r) => {
                  const highGi = highGiCarbShare(r.items);
                  return (
                    <li key={r.mealId} className="space-y-2 py-3">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{r.description}</p>
                          <p className="text-[13px] text-steel">
                            {[
                              dayLabel(r.localDate),
                              t("glucose.responses.carbs", { carbs: Math.round(r.carbsG) }),
                              highGi && highGi.share >= 0.5 ? t("glucose.highGiShare", { pct: Math.round(highGi.share * 100) }) : null,
                            ]
                              .filter(Boolean)
                              .join(zh ? "，" : ", ")}
                          </p>
                          <StatusTag status={r.status} />
                        </div>
                        <div className="text-right">
                          <p className="num font-semibold">
                            {r.beforeMmol !== null
                              ? t("glucose.responses.row", { before: fmt(r.beforeMmol), after: fmt(r.afterMmol), unit: unitLabel(unit) })
                              : t("glucose.responses.afterOnly", { after: fmt(r.afterMmol), unit: unitLabel(unit) })}
                          </p>
                          {r.beforeMmol !== null && (
                            <p className="num text-[13px] text-steel">
                              {t("glucose.responses.rise", { delta: `${r.afterMmol >= r.beforeMmol ? "+" : "−"}${fmt(Math.abs(r.afterMmol - r.beforeMmol))}` })}
                            </p>
                          )}
                          <p className="text-xs text-steel">{t("glucose.responses.minutesAfter", { minutes: r.minutesAfter })}</p>
                        </div>
                      </div>
                      <RiseBar before={r.beforeMmol} after={r.afterMmol} status={r.status} targets={targets} scaleMax={responseScale} />
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          {recentDays.map(([date, list]) => (
            <Section key={date} title={dayLabel(date)}>
              {readingList(list)}
            </Section>
          ))}
          {olderDays.length > 0 && (
            <details className="rounded-[10px] border border-line bg-paper px-3 py-2 text-sm">
              <summary className="cursor-pointer font-medium text-steel">
                {t("glucose.olderDays", { count: olderDays.reduce((n, [, list]) => n + list.length, 0) })}
              </summary>
              <div className="mt-3 space-y-5">
                {olderDays.map(([date, list]) => (
                  <Section key={date} title={dayLabel(date)}>
                    {readingList(list)}
                  </Section>
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}

export default function GlucosePage(props: PageProps<"/glucose">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Glucose searchParams={props.searchParams} />
    </Suspense>
  );
}

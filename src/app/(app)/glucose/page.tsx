import { Suspense } from "react";
import Link from "next/link";
import { requireProfile } from "@/lib/session";
import { db } from "@/lib/db";
import { addDays, formatLocalDate, toLocalTime, todayLocal } from "@/lib/dates";
import { GLUCOSE_CONTEXTS, classifyReading, summarize, toDisplay, unitLabel, type GlucoseContext, type GlucoseTargets } from "@/lib/glucose";
import { GlucoseLogger } from "@/components/glucose/GlucoseLogger";
import { GlucoseValue, SafetyCard, StatusTag } from "@/components/glucose/GlucoseBits";
import { DeleteReadingButton } from "@/components/glucose/DeleteReadingButton";
import { Card, EmptyState, PageHeader, PageSkeleton, Section, buttonClass } from "@/components/ui";
import { getT } from "@/i18n/server";
import { INTL_LOCALE } from "@/i18n/config";

export const metadata = { title: "Glucose" };

const WINDOW_DAYS = 14;

async function Glucose({ searchParams }: { searchParams: PageProps<"/glucose">["searchParams"] }) {
  const { user, profile } = await requireProfile();
  const [sp, t] = await Promise.all([searchParams, getT()]);
  const intl = INTL_LOCALE[t.locale];

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

  const [readings, todaysMeals] = await Promise.all([
    db.glucoseReading.findMany({
      where: { userId: user.id, localDate: { gte: addDays(today, -(WINDOW_DAYS - 1)) } },
      // Ties (same minute) go to the reading logged last.
      orderBy: [{ measuredAt: "desc" }, { createdAt: "desc" }],
      include: { meal: { select: { description: true, eatenAt: true } } },
    }),
    db.meal.findMany({ where: { userId: user.id, localDate: today }, orderBy: { eatenAt: "asc" }, select: { id: true, description: true, eatenAt: true } }),
  ]);

  const rated = readings.map((r) => {
    const minutesAfterMeal = r.meal ? Math.round((r.measuredAt.getTime() - r.meal.eatenAt.getTime()) / 60000) : null;
    return { ...r, minutesAfterMeal, status: classifyReading({ mmol: r.mmol, context: r.context, minutesAfterMeal }, targets) };
  });
  const summary = summarize(rated.map((r) => r.status));
  const latest = rated[0];
  const byDay = Map.groupBy(rated, (r) => r.localDate);

  const initialContext = GLUCOSE_CONTEXTS.find((c) => c === sp.context) ?? null;
  const initialMealId = typeof sp.meal === "string" ? sp.meal : null;
  const fmt = (mmol: number) => toDisplay(mmol, unit);

  return (
    <div className="space-y-7">
      <PageHeader
        title={t("glucose.title")}
        subtitle={t("glucose.target", { min: fmt(targets.fastingMin), max: fmt(targets.fastingMax), post: fmt(targets.postMealMax), unit: unitLabel(unit) })}
      />

      {/* A recent low or very high reading keeps its card on screen until a newer reading. */}
      {latest && latest.localDate === today && <SafetyCard status={latest.status} unit={unit} />}

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
          <section aria-labelledby="summary-title" className="space-y-1">
            <h2 id="summary-title" className="text-sm text-steel">
              {t("glucose.summaryWindow")}
            </h2>
            <p className="display text-[28px]" data-testid="glucose-summary">
              {t("glucose.summary", { inTarget: summary.inTarget, rated: summary.rated })}
            </p>
            {summary.low > 0 && <p className="text-sm font-semibold text-alert">{t("glucose.lows", { count: summary.low })}</p>}
          </section>

          {[...byDay].map(([date, list]) => (
            <Section key={date} title={date === today ? t("glucose.today") : formatLocalDate(date, undefined, intl)}>
              <ul className="divide-y divide-line border-y border-line">
                {list.map((r) => {
                  const time = toLocalTime(r.measuredAt, tz);
                  return (
                    <li key={r.id} className="flex items-center gap-3 py-2.5" data-testid="glucose-reading">
                      <span className="num w-12 shrink-0 text-sm text-steel">{time}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {t(`glucose.context.${r.context}`)}
                          {r.meal && <span className="font-normal text-steel"> {t("glucose.afterMeal", { meal: r.meal.description })}</span>}
                        </p>
                        <StatusTag status={r.status} />
                        {r.note && <p className="text-xs text-steel">{r.note}</p>}
                      </div>
                      <GlucoseValue mmol={r.mmol} unit={unit} className="score text-[24px]" />
                      <DeleteReadingButton id={r.id} time={time} />
                    </li>
                  );
                })}
              </ul>
            </Section>
          ))}
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

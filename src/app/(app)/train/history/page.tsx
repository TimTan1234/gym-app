import { Suspense } from "react";
import Link from "next/link";
import { requireProfile } from "@/lib/session";
import { db } from "@/lib/db";
import { addDays, formatLocalDate, startOfWeek } from "@/lib/dates";
import { displayWeight, weightUnit } from "@/lib/units";
import { durationMinutes, totalVolume } from "@/lib/training/summary";
import { EmptyState, PageHeader, PageSkeleton, cn } from "@/components/ui";
import { getT } from "@/i18n/server";
import { INTL_LOCALE } from "@/i18n/config";
import { exerciseName } from "@/i18n/labels";

export const metadata = { title: "Workout history" };

async function HistoryList() {
  const { user, profile } = await requireProfile();
  const t = await getT();
  const intl = INTL_LOCALE[t.locale];
  const sessions = await db.workoutSession.findMany({
    where: { userId: user.id, endedAt: { not: null } },
    orderBy: { startedAt: "desc" },
    take: 100,
    include: {
      planDay: { select: { name: true } },
      sets: { select: { exerciseId: true, weightKg: true, reps: true, isWarmup: true, exercise: { select: { slug: true, name: true } } } },
    },
  });

  const header = <PageHeader title={t("train.history")} />;
  if (sessions.length === 0) {
    return (
      <>
        {header}
        <EmptyState title={t("train.noWorkouts")}>{t("train.noHistoryHint")}</EmptyState>
      </>
    );
  }

  const weeks = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const w = startOfWeek(s.localDate);
    weeks.set(w, [...(weeks.get(w) ?? []), s]);
  }

  return (
    <div className="space-y-8">
      {header}
      {[...weeks].map(([week, list]) => {
        const trained = new Set(list.map((s) => s.localDate));
        return (
          <section key={week}>
            <div className="flex items-end justify-between gap-3">
              <h2 className="min-w-0 text-sm font-medium">
                {t("train.weekOf", { date: formatLocalDate(week, { weekday: undefined }, intl) })}
              </h2>
              {/* Monday to Sunday, with the days trained filled in: the shape of the week at a glance. */}
              <ol className="flex shrink-0 gap-1" aria-hidden>
                {Array.from({ length: 7 }, (_, i) => addDays(week, i)).map((d) => (
                  <li
                    key={d}
                    className={cn(
                      "grid size-5 place-items-center rounded-full text-[10px] font-medium",
                      trained.has(d) ? "bg-iron text-iron-fg" : "text-steel/60",
                    )}
                  >
                    {formatLocalDate(d, { weekday: "narrow", month: undefined, day: undefined }, intl)}
                  </li>
                ))}
              </ol>
            </div>
            <ul className="mt-2 divide-y divide-line border-y border-line">
              {list.map((s) => {
                const names = [...new Set(s.sets.map((x) => exerciseName(t, x.exercise)))];
                return (
                  <li key={s.id}>
                    <Link href={`/train/history/${s.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-wash">
                      <span className="min-w-0">
                        <span className="block font-medium">{s.planDay?.name ?? t("train.workout")}</span>
                        <span className="num block text-[13px] text-steel">
                          {formatLocalDate(s.localDate, undefined, intl)}, {t("train.minutesShort", { n: durationMinutes(s.startedAt, s.endedAt) ?? "–" })},{" "}
                          {t.plural("train.setCount", s.sets.filter((x) => !x.isWarmup).length)}
                        </span>
                        <span className="mt-0.5 line-clamp-1 text-[13px] text-steel">{names.join(", ")}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="score block text-[24px]">{Math.round(displayWeight(totalVolume(s.sets), profile.unitSystem, 0)).toLocaleString()}</span>
                        <span className="block text-[12px] text-steel">{t("train.lifted", { unit: weightUnit(profile.unitSystem) })}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export default function HistoryPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <HistoryList />
    </Suspense>
  );
}

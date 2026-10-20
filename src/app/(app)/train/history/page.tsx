import { Suspense } from "react";
import Link from "next/link";
import { requireProfile } from "@/lib/session";
import { db } from "@/lib/db";
import { formatLocalDate, startOfWeek } from "@/lib/dates";
import { displayWeight, weightUnit } from "@/lib/units";
import { durationMinutes, totalVolume } from "@/lib/training/summary";
import { EmptyState, PageHeader, PageSkeleton } from "@/components/ui";
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
      {[...weeks].map(([week, list]) => (
        <section key={week}>
          <h2 className="display text-[18px] text-steel">
            {t.plural("train.weekOf", list.length, { date: formatLocalDate(week, { weekday: undefined }, intl) })}
          </h2>
          <ul className="mt-2 divide-y divide-line border-y border-line">
            {list.map((s) => {
              const names = [...new Set(s.sets.map((x) => exerciseName(t, x.exercise)))];
              return (
                <li key={s.id}>
                  <Link href={`/train/history/${s.id}`} className="block py-3 hover:bg-wash">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="display text-[18px]">{s.planDay?.name ?? t("train.workout")}</span>
                      <span className="text-[13px] text-steel">{formatLocalDate(s.localDate, undefined, intl)}</span>
                    </span>
                    <span className="num block text-[13px] text-steel">
                      {t("train.minutesShort", { n: durationMinutes(s.startedAt, s.endedAt) ?? "–" })},{" "}
                      {t.plural("train.setCount", s.sets.filter((x) => !x.isWarmup).length)},{" "}
                      {t("train.liftedInline", {
                        volume: Math.round(displayWeight(totalVolume(s.sets), profile.unitSystem, 0)).toLocaleString(),
                        unit: weightUnit(profile.unitSystem),
                      })}
                    </span>
                    <span className="mt-0.5 line-clamp-1 block text-sm">{names.join(", ")}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
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

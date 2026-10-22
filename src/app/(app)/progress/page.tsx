import { Suspense } from "react";
import Link from "next/link";
import { Flame, Trophy } from "lucide-react";
import { requireProfile } from "@/lib/session";
import { db } from "@/lib/db";
import { addDays, startOfWeek, todayLocal } from "@/lib/dates";
import { displayWeight, formatWeight, weightUnit } from "@/lib/units";
import { adherence, currentStreak, fillDays, movingAverage, setsPerMuscle } from "@/lib/progress";
import { totalVolume } from "@/lib/training/summary";
import { CategoryBars, DailyBars, TrendChart } from "@/components/charts";
import { BodyMetricsLog } from "@/components/body/BodyMetricsLog";
import { getCheckin } from "@/lib/queries";
import { WeeklyCheckin } from "@/components/progress/WeeklyCheckin";
import { EmptyState, PageHeader, PageSkeleton, cn } from "@/components/ui";
import { getT } from "@/i18n/server";
import { exerciseName, labelOf } from "@/i18n/labels";

export const metadata = { title: "Progress" };

const RANGES = [
  { days: 30, label: "progress.range30" },
  { days: 90, label: "progress.range90" },
  { days: 180, label: "progress.range180" },
] as const;

function Stat({ label: l, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="py-3 pr-3">
      <p className="text-xs text-steel">{l}</p>
      <p className="score mt-1 text-[30px]">{value}</p>
      {sub && <p className="text-xs text-steel">{sub}</p>}
    </div>
  );
}

async function Progress({ searchParams }: { searchParams: PageProps<"/progress">["searchParams"] }) {
  const { user, profile } = await requireProfile();
  const sp = await searchParams;
  const rangeDays: number = RANGES.find((r) => String(r.days) === sp.range)?.days ?? 30;
  const today = todayLocal(profile.timezone);
  const start = addDays(today, -(rangeDays - 1));
  const units = profile.unitSystem;

  const [metrics, mealDays, sessions, prs, streakDays, checkin, t] = await Promise.all([
    db.bodyMetric.findMany({ where: { userId: user.id, localDate: { gte: start } }, orderBy: { localDate: "asc" } }),
    db.meal.groupBy({
      by: ["localDate"],
      where: { userId: user.id, localDate: { gte: start, lte: today } },
      _sum: { kcal: true, proteinG: true },
    }),
    db.workoutSession.findMany({
      where: { userId: user.id, endedAt: { not: null }, localDate: { gte: start } },
      select: {
        localDate: true,
        sets: { select: { exerciseId: true, weightKg: true, reps: true, isWarmup: true, exercise: { select: { primaryMuscle: true } } } },
      },
    }),
    db.personalRecord.groupBy({
      by: ["exerciseId"],
      where: { userId: user.id, type: "EST_1RM" },
      _max: { value: true },
      orderBy: { _max: { value: "desc" } },
      take: 8,
    }),
    db.meal.findMany({
      where: { userId: user.id, localDate: { gte: addDays(today, -365) } },
      distinct: ["localDate"],
      select: { localDate: true },
    }),
    getCheckin(user.id, profile),
    getT(),
  ]);

  const prNames = new Map(
    (await db.exercise.findMany({ where: { id: { in: prs.map((p) => p.exerciseId) } }, select: { id: true, name: true, slug: true } })).map((e) => [
      e.id,
      exerciseName(t, e),
    ]),
  );

  // Body weight
  const weightTrend = movingAverage(metrics.map((m) => ({ date: m.localDate, value: displayWeight(m.weightKg, units) })));
  const weightChange = weightTrend.length >= 2 ? weightTrend.at(-1)!.avg - weightTrend[0].avg : null;

  // Nutrition
  const kcalByDay = new Map(mealDays.map((d) => [d.localDate, d._sum.kcal ?? 0]));
  const proteinByDay = new Map(mealDays.map((d) => [d.localDate, d._sum.proteinG ?? 0]));
  const stats = adherence(
    mealDays.map((d) => ({ kcal: d._sum.kcal ?? 0, proteinG: d._sum.proteinG ?? 0 })),
    { kcal: profile.targetKcal, proteinG: profile.targetProteinG },
  );
  const logStreak = currentStreak(new Map(streakDays.map((d) => [d.localDate, true])), today);
  const barStart = rangeDays > 30 ? addDays(today, -29) : start;

  // Training
  const weekStart = addDays(today, -6);
  const lastWeekSets = sessions
    .filter((s) => s.localDate >= weekStart)
    .flatMap((s) => s.sets.map((x) => ({ isWarmup: x.isWarmup, primaryMuscle: x.exercise.primaryMuscle })));
  const muscleData = setsPerMuscle(lastWeekSets).map((m) => ({ label: labelOf(t, "muscle", m.muscle), value: m.value }));

  const weeklyVolume = new Map<string, number>();
  const weeklyCount = new Map<string, number>();
  for (const s of sessions) {
    const w = startOfWeek(s.localDate);
    weeklyVolume.set(w, (weeklyVolume.get(w) ?? 0) + totalVolume(s.sets));
    weeklyCount.set(w, (weeklyCount.get(w) ?? 0) + 1);
  }
  const weeks: string[] = [];
  for (let w = startOfWeek(start); w <= today; w = addDays(w, 7)) weeks.push(w);
  const volumeData = weeks.map((w) => ({ date: w, value: Math.round(displayWeight(weeklyVolume.get(w) ?? 0, units, 0)) }));
  const avgPerWeek = sessions.length / Math.max(1, weeks.length);

  return (
    <div className="space-y-10">
      <PageHeader title={t("progress.title")} />
      <WeeklyCheckin checkin={checkin} targetKcal={profile.targetKcal} units={units} />
      <nav aria-label={t("progress.range")} className="flex gap-2">
        {RANGES.map((r) => (
          <Link
            key={r.days}
            href={`/progress?range=${r.days}`}
            aria-current={r.days === rangeDays ? "true" : undefined}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm",
              r.days === rangeDays ? "border-iron bg-iron font-semibold text-iron-fg" : "border-line text-steel hover:border-iron",
            )}
          >
            {t(r.label)}
          </Link>
        ))}
      </nav>

      <section className="space-y-3">
        <h2 className="display text-[22px]">{t("progress.body")}</h2>
        <div className="grid grid-cols-2 gap-x-4 border-y border-line [&>*:nth-child(2n)]:border-l [&>*:nth-child(2n)]:border-line [&>*:nth-child(2n)]:pl-4">
          <Stat
            label={t("progress.currentAvg")}
            value={weightTrend.length ? `${weightTrend.at(-1)!.avg} ${weightUnit(units)}` : "–"}
          />
          <Stat
            label={t("progress.change", { range: t(RANGES.find((r) => r.days === rangeDays)!.label) })}
            value={weightChange === null ? "–" : `${weightChange > 0 ? "+" : weightChange < 0 ? "−" : ""}${Math.abs(weightChange).toFixed(1)} ${weightUnit(units)}`}
            sub={t(profile.goal === "CUT" ? "progress.goalLose" : profile.goal === "BULK" ? "progress.goalGain" : "progress.goalMaintain")}
          />
        </div>
        <div className="space-y-6 pt-2">
          {weightTrend.length >= 2 ? (
            <TrendChart title={t("progress.bodyWeight")} data={weightTrend} unit={weightUnit(units)} />
          ) : (
            <p className="text-sm text-steel">{t("progress.needTwoWeighIns")}</p>
          )}
          <BodyMetricsLog today={today} units={units} entries={[...metrics].reverse()} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="display text-[22px]">{t("progress.nutrition")}</h2>
        <div className="grid grid-cols-2 gap-x-4 border-y border-line sm:grid-cols-4 [&>*:nth-child(2n)]:border-l [&>*:nth-child(2n)]:border-line [&>*:nth-child(2n)]:pl-4">
          <Stat
            label={t("progress.avgCalories")}
            value={stats.daysLogged ? stats.avgKcal.toLocaleString("en-US") : "–"}
            sub={t("progress.target", { value: profile.targetKcal.toLocaleString("en-US") })}
          />
          <Stat
            label={t("progress.avgProtein")}
            value={stats.daysLogged ? `${stats.avgProtein} g` : "–"}
            sub={t("progress.target", { value: `${profile.targetProteinG} g` })}
          />
          <Stat
            label={t("progress.caloriesOnTarget")}
            value={stats.daysLogged ? `${stats.kcalOnTargetPct}%` : "–"}
            sub={t.plural("progress.daysLogged", stats.daysLogged)}
          />
          <Stat label={t("progress.loggingStreak")} value={String(logStreak)} sub={t(logStreak === 1 ? "progress.dayOne" : "progress.dayOther")} />
        </div>
        {stats.daysLogged > 0 ? (
          <div className="space-y-8 pt-2">
            <DailyBars title={t("progress.calories")} data={fillDays(kcalByDay, barStart, today)} unit={t("common.kcal")} target={profile.targetKcal} />
            <DailyBars
              title={t("progress.protein")}
              data={fillDays(proteinByDay, barStart, today)}
              unit="g"
              target={profile.targetProteinG}
              color="var(--plate-blue)"
            />
          </div>
        ) : (
          <EmptyState title={t("progress.noMeals")} />
        )}
      </section>

      <section className="space-y-3">
        <h2 className="display text-[22px]">{t("progress.training")}</h2>
        <div className="grid grid-cols-2 gap-x-4 border-y border-line [&>*:nth-child(2n)]:border-l [&>*:nth-child(2n)]:border-line [&>*:nth-child(2n)]:pl-4">
          <Stat label={t("progress.workouts")} value={String(sessions.length)} sub={t("progress.perWeek", { n: avgPerWeek.toFixed(1) })} />
          <Stat
            label={t("progress.setsLast7")}
            value={String(lastWeekSets.filter((s) => !s.isWarmup).length)}
            sub={t("progress.workingSets")}
          />
        </div>
        {sessions.length > 0 ? (
          <div className="space-y-8 pt-2">
            {muscleData.length > 0 && <CategoryBars title={t("progress.setsPerMuscle")} data={muscleData} unit={t("progress.sets")} />}
            <DailyBars title={t("progress.weeklyVolume", { unit: weightUnit(units) })} data={volumeData} unit={weightUnit(units)} />
          </div>
        ) : (
          <EmptyState title={t("progress.noWorkouts")} />
        )}
      </section>

      {prs.length > 0 && (
        <section className="space-y-3">
          <h2 className="display flex items-center gap-2 text-[22px]">
            <Trophy className="size-5" aria-hidden /> {t("progress.strengthRecords")}
          </h2>
          <p className="-mt-2 text-[13px] text-steel">{t("progress.bestE1rm")}</p>
          <div className="border-y border-line">
            <ul className="divide-y divide-line">
              {prs.map((pr) => (
                <li key={pr.exerciseId}>
                  <Link href={`/train/exercises/${pr.exerciseId}`} className="flex items-center justify-between py-2.5 hover:bg-wash">
                    <span className="font-medium">{prNames.get(pr.exerciseId)}</span>
                    <span className="score text-[22px]">{formatWeight(pr._max.value ?? 0, units)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
      <p className="flex items-center gap-1.5 text-xs text-steel">
        <Flame className="size-3.5" /> {t("progress.trendTip")}
      </p>
    </div>
  );
}

export default function ProgressPage(props: PageProps<"/progress">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Progress searchParams={props.searchParams} />
    </Suspense>
  );
}

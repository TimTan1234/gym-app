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
import { label } from "@/lib/format";
import { EmptyState, PageHeader, PageSkeleton, cn } from "@/components/ui";

export const metadata = { title: "Progress" };

const RANGES = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 180, label: "6 months" },
];

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
  const rangeDays = RANGES.find((r) => String(r.days) === sp.range)?.days ?? 30;
  const today = todayLocal(profile.timezone);
  const start = addDays(today, -(rangeDays - 1));
  const units = profile.unitSystem;

  const [metrics, mealDays, sessions, prs, streakDays] = await Promise.all([
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
  ]);

  const prNames = new Map(
    (await db.exercise.findMany({ where: { id: { in: prs.map((p) => p.exerciseId) } }, select: { id: true, name: true } })).map((e) => [e.id, e.name]),
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
  const muscleData = setsPerMuscle(lastWeekSets).map((m) => ({ label: label(m.muscle), value: m.value }));

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
      <PageHeader title="Progress" />
      <nav aria-label="Range" className="flex gap-1.5">
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
            {r.label}
          </Link>
        ))}
      </nav>

      <section className="space-y-3">
        <h2 className="display text-[22px]">Body</h2>
        <div className="grid grid-cols-2 gap-x-4 border-y border-line [&>*:nth-child(2n)]:border-l [&>*:nth-child(2n)]:border-line [&>*:nth-child(2n)]:pl-4">
          <Stat
            label="Current (7-day avg)"
            value={weightTrend.length ? `${weightTrend.at(-1)!.avg} ${weightUnit(units)}` : "–"}
          />
          <Stat
            label={`Change (${RANGES.find((r) => r.days === rangeDays)!.label})`}
            value={weightChange === null ? "–" : `${weightChange > 0 ? "+" : ""}${weightChange.toFixed(1)} ${weightUnit(units)}`}
            sub={profile.goal === "CUT" ? "Goal: lose" : profile.goal === "BULK" ? "Goal: gain" : "Goal: maintain"}
          />
        </div>
        <div className="space-y-6 pt-2">
          {weightTrend.length >= 2 ? (
            <TrendChart title="Body weight" data={weightTrend} unit={weightUnit(units)} />
          ) : (
            <p className="text-sm text-steel">Log your weight on at least two days to see a trend. Weigh in at the same time each morning for the most reliable trend.</p>
          )}
          <BodyMetricsLog today={today} units={units} entries={[...metrics].reverse()} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="display text-[22px]">Nutrition</h2>
        <div className="grid grid-cols-2 gap-x-4 border-y border-line sm:grid-cols-4 [&>*:nth-child(2n)]:border-l [&>*:nth-child(2n)]:border-line [&>*:nth-child(2n)]:pl-4">
          <Stat label="Avg calories" value={stats.daysLogged ? `${stats.avgKcal}` : "–"} sub={`target ${profile.targetKcal}`} />
          <Stat label="Avg protein" value={stats.daysLogged ? `${stats.avgProtein} g` : "–"} sub={`target ${profile.targetProteinG} g`} />
          <Stat label="Calories on target" value={stats.daysLogged ? `${stats.kcalOnTargetPct}%` : "–"} sub={`${stats.daysLogged} days logged`} />
          <Stat label="Logging streak" value={String(logStreak)} sub={logStreak === 1 ? "day" : "days"} />
        </div>
        {stats.daysLogged > 0 ? (
          <div className="space-y-8 pt-2">
            <DailyBars title="Calories" data={fillDays(kcalByDay, barStart, today)} unit="kcal" target={profile.targetKcal} />
            <DailyBars title="Protein" data={fillDays(proteinByDay, barStart, today)} unit="g" target={profile.targetProteinG} color="var(--plate-blue)" />
          </div>
        ) : (
          <EmptyState title="No meals logged in this range" />
        )}
      </section>

      <section className="space-y-3">
        <h2 className="display text-[22px]">Training</h2>
        <div className="grid grid-cols-2 gap-x-4 border-y border-line [&>*:nth-child(2n)]:border-l [&>*:nth-child(2n)]:border-line [&>*:nth-child(2n)]:pl-4">
          <Stat label="Workouts" value={String(sessions.length)} sub={`${avgPerWeek.toFixed(1)} per week`} />
          <Stat label="Sets last 7 days" value={String(lastWeekSets.filter((s) => !s.isWarmup).length)} sub="working sets" />
        </div>
        {sessions.length > 0 ? (
          <div className="space-y-8 pt-2">
            {muscleData.length > 0 && <CategoryBars title="Working sets per muscle (last 7 days)" data={muscleData} unit="sets" />}
            <DailyBars title={`Weekly volume (${weightUnit(units)})`} data={volumeData} unit={weightUnit(units)} />
          </div>
        ) : (
          <EmptyState title="No workouts in this range" />
        )}
      </section>

      {prs.length > 0 && (
        <section className="space-y-3">
          <h2 className="display flex items-center gap-2 text-[22px]">
            <Trophy className="size-5" aria-hidden /> Strength records
          </h2>
          <p className="-mt-2 text-[13px] text-steel">Best estimated 1-rep max per exercise</p>
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
        <Flame className="size-3.5" /> Weight trends move slowly: judge progress by the 7-day average over 2–3 weeks, not daily swings.
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

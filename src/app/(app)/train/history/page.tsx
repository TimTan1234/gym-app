import { Suspense } from "react";
import Link from "next/link";
import { requireProfile } from "@/lib/session";
import { db } from "@/lib/db";
import { formatLocalDate, startOfWeek } from "@/lib/dates";
import { displayWeight, weightUnit } from "@/lib/units";
import { durationMinutes, totalVolume } from "@/lib/training/summary";
import { EmptyState, PageHeader, PageSkeleton } from "@/components/ui";

export const metadata = { title: "Workout history" };

async function HistoryList() {
  const { user, profile } = await requireProfile();
  const sessions = await db.workoutSession.findMany({
    where: { userId: user.id, endedAt: { not: null } },
    orderBy: { startedAt: "desc" },
    take: 100,
    include: {
      planDay: { select: { name: true } },
      sets: { select: { exerciseId: true, weightKg: true, reps: true, isWarmup: true, exercise: { select: { name: true } } } },
    },
  });

  if (sessions.length === 0) {
    return <EmptyState title="No workouts yet">Finish a workout and it will show up here.</EmptyState>;
  }

  const weeks = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const w = startOfWeek(s.localDate);
    weeks.set(w, [...(weeks.get(w) ?? []), s]);
  }

  return (
    <div className="space-y-8">
      {[...weeks].map(([week, list]) => (
        <section key={week}>
          <h2 className="display text-[18px] text-steel">
            Week of {formatLocalDate(week, { weekday: undefined })}, {list.length} workout{list.length > 1 ? "s" : ""}
          </h2>
          <ul className="mt-2 divide-y divide-line border-y border-line">
            {list.map((s) => {
              const names = [...new Set(s.sets.map((x) => x.exercise.name))];
              return (
                <li key={s.id}>
                  <Link href={`/train/history/${s.id}`} className="block py-3 hover:bg-wash">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="display text-[18px]">{s.planDay?.name ?? "Workout"}</span>
                      <span className="text-[13px] text-steel">{formatLocalDate(s.localDate)}</span>
                    </span>
                    <span className="num block text-[13px] text-steel">
                      {durationMinutes(s.startedAt, s.endedAt)} min, {s.sets.filter((x) => !x.isWarmup).length} sets,{" "}
                      {Math.round(displayWeight(totalVolume(s.sets), profile.unitSystem, 0)).toLocaleString()} {weightUnit(profile.unitSystem)} lifted
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
    <>
      <PageHeader title="History" />
      <Suspense fallback={<PageSkeleton />}>
        <HistoryList />
      </Suspense>
    </>
  );
}

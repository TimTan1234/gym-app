import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/session";
import { db } from "@/lib/db";
import { formatLocalDate } from "@/lib/dates";
import { displayWeight, weightUnit } from "@/lib/units";
import { best1RM } from "@/lib/training/summary";
import { RECORD_LABELS, type RecordType } from "@/lib/training/records";
import { TrendChart } from "@/components/charts";
import { label } from "@/lib/format";
import { EmptyState, PageHeader, PageSkeleton, Section } from "@/components/ui";

export const metadata = { title: "Exercise" };

async function ExerciseDetail({ params }: { params: PageProps<"/train/exercises/[id]">["params"] }) {
  const { id } = await params;
  const { user, profile } = await requireProfile();
  const exercise = await db.exercise.findFirst({ where: { id, OR: [{ userId: null }, { userId: user.id }] } });
  if (!exercise) notFound();

  const [sets, records] = await Promise.all([
    db.workoutSet.findMany({
      where: { exerciseId: id, session: { userId: user.id, endedAt: { not: null } } },
      orderBy: { completedAt: "asc" },
      select: { exerciseId: true, weightKg: true, reps: true, isWarmup: true, rpe: true, sessionId: true, session: { select: { localDate: true } } },
    }),
    db.personalRecord.groupBy({ by: ["type"], where: { userId: user.id, exerciseId: id }, _max: { value: true } }),
  ]);

  const units = profile.unitSystem;
  const bySession = new Map<string, { date: string; sets: typeof sets }>();
  for (const s of sets) {
    const g = bySession.get(s.sessionId) ?? { date: s.session.localDate, sets: [] };
    g.sets.push(s);
    bySession.set(s.sessionId, g);
  }
  const sessions = [...bySession.entries()];
  const trend = sessions.map(([, g]) => ({ date: g.date, value: displayWeight(best1RM(g.sets), units) }));

  const secondary = exercise.secondaryMuscles.map((m) => label(m).toLowerCase());

  return (
    <div className="space-y-8">
      <PageHeader
        title={exercise.name}
        subtitle={`${label(exercise.primaryMuscle)}${secondary.length ? `, also ${secondary.join(", ")}` : ""}. ${label(exercise.equipment)}.`}
      />
      {records.length > 0 && (
        <dl className="grid grid-cols-3 divide-x divide-line border-y border-line">
          {(["EST_1RM", "MAX_WEIGHT", "MAX_VOLUME_SET"] as RecordType[]).map((t) => {
            const v = records.find((r) => r.type === t)?._max.value;
            return (
              <div key={t} className="px-3 py-3 first:pl-0">
                <dd className="score text-[28px]">
                  {v === null || v === undefined ? "–" : t === "MAX_VOLUME_SET" ? Math.round(displayWeight(v, units, 0)).toLocaleString() : displayWeight(v, units)}
                </dd>
                <dt className="text-[13px] text-steel">
                  {RECORD_LABELS[t]}, {weightUnit(units)}
                </dt>
              </div>
            );
          })}
        </dl>
      )}
      {trend.length >= 2 && <TrendChart title="Estimated 1-rep max per session" data={trend} unit={weightUnit(units)} />}
      <Section title="History">
        {sessions.length === 0 ? (
          <EmptyState title="Not logged yet">Sets you log for this exercise will appear here.</EmptyState>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {[...sessions].reverse().map(([sessionId, g]) => (
              <li key={sessionId}>
                <Link href={`/train/history/${sessionId}`} className="flex items-center justify-between gap-3 py-3 hover:bg-wash">
                  <span>
                    <span className="block text-sm font-semibold">{formatLocalDate(g.date)}</span>
                    <span className="num block text-[13px] text-steel">
                      {g.sets.filter((s) => !s.isWarmup).map((s) => `${displayWeight(s.weightKg, units)}×${s.reps}`).join(", ")}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="score block text-[22px]">{displayWeight(best1RM(g.sets), units)}</span>
                    <span className="block text-[12px] text-steel">est. 1RM</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

export default function ExercisePage(props: PageProps<"/train/exercises/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ExerciseDetail params={props.params} />
    </Suspense>
  );
}

import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/session";
import { db } from "@/lib/db";
import { formatLocalDate } from "@/lib/dates";
import { displayWeight, weightUnit } from "@/lib/units";
import { durationMinutes, totalVolume } from "@/lib/training/summary";
import { DeleteWorkoutButton } from "@/components/train/DeleteWorkoutButton";
import { FinishedSets } from "@/components/train/FinishedSets";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { getT } from "@/i18n/server";
import { INTL_LOCALE } from "@/i18n/config";
import { exerciseName } from "@/i18n/labels";

export const metadata = { title: "Workout" };

async function SessionDetail({ params }: { params: PageProps<"/train/history/[id]">["params"] }) {
  const { id } = await params;
  const { user, profile } = await requireProfile();
  const t = await getT();
  const session = await db.workoutSession.findFirst({
    where: { id, userId: user.id },
    include: {
      planDay: { select: { name: true, plan: { select: { name: true } } } },
      sets: { orderBy: [{ completedAt: "asc" }], include: { exercise: { select: { id: true, slug: true, name: true, category: true } }, records: { select: { type: true } } } },
    },
  });
  if (!session) notFound();

  const byExercise = new Map<string, { name: string; cardio: boolean; sets: typeof session.sets }>();
  for (const s of session.sets) {
    const g = byExercise.get(s.exerciseId) ?? { name: exerciseName(t, s.exercise), cardio: s.exercise.category === "CARDIO", sets: [] };
    g.sets.push(s);
    byExercise.set(s.exerciseId, g);
  }
  const units = profile.unitSystem;
  const prCount = session.sets.reduce((n, s) => n + s.records.length, 0);

  return (
    <div className="space-y-7">
      <PageHeader
        title={session.planDay?.name ?? t("train.workout")}
        subtitle={`${formatLocalDate(session.localDate, { weekday: "long" }, INTL_LOCALE[t.locale])}${session.planDay ? `, ${session.planDay.plan.name}` : ""}`}
        action={<DeleteWorkoutButton sessionId={session.id} />}
      />
      <dl className="grid grid-cols-3 divide-x divide-line border-y border-line">
        {[
          { label: t("train.minutes"), value: String(durationMinutes(session.startedAt, session.endedAt) ?? "–") },
          { label: t("train.lifted", { unit: weightUnit(units) }), value: Math.round(displayWeight(totalVolume(session.sets), units, 0)).toLocaleString() },
          { label: t("train.records"), value: String(prCount) },
        ].map((s) => (
          <div key={s.label} className="px-3 py-3 first:pl-0">
            <dd className="score text-[30px]">{s.value}</dd>
            <dt className="text-[13px] text-steel">{s.label}</dt>
          </div>
        ))}
      </dl>
      {session.notes && <p className="border-l-2 border-iron pl-3 text-[15px] italic">{session.notes}</p>}
      {[...byExercise].map(([exerciseId, g]) => (
        <section key={exerciseId} className="space-y-2">
          <Link href={`/train/exercises/${exerciseId}`} className="block text-[17px] font-semibold hover:underline">
            {g.name}
          </Link>
          <FinishedSets
            cardio={g.cardio}
            units={units}
            sets={g.sets.map((s) => ({
              id: s.id,
              setIndex: s.setIndex,
              weightKg: s.weightKg,
              reps: s.reps,
              rpe: s.rpe,
              isWarmup: s.isWarmup,
              durationSec: s.durationSec,
              distanceM: s.distanceM,
              records: s.records.map((r) => r.type),
            }))}
          />
        </section>
      ))}
    </div>
  );
}

export default function SessionPage(props: PageProps<"/train/history/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SessionDetail params={props.params} />
    </Suspense>
  );
}

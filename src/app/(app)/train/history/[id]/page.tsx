import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Trophy } from "lucide-react";
import { requireProfile } from "@/lib/session";
import { db } from "@/lib/db";
import { formatLocalDate } from "@/lib/dates";
import { displayWeight, formatWeight, weightUnit } from "@/lib/units";
import { durationMinutes, totalVolume } from "@/lib/training/summary";
import { estimate1RM } from "@/lib/training/oneRepMax";
import { RECORD_LABELS } from "@/lib/training/records";
import { DeleteWorkoutButton } from "@/components/train/DeleteWorkoutButton";
import { PageHeader, PageSkeleton } from "@/components/ui";

export const metadata = { title: "Workout" };

async function SessionDetail({ params }: { params: PageProps<"/train/history/[id]">["params"] }) {
  const { id } = await params;
  const { user, profile } = await requireProfile();
  const session = await db.workoutSession.findFirst({
    where: { id, userId: user.id },
    include: {
      planDay: { select: { name: true, plan: { select: { name: true } } } },
      sets: { orderBy: [{ completedAt: "asc" }], include: { exercise: { select: { id: true, name: true } }, records: true } },
    },
  });
  if (!session) notFound();

  const byExercise = new Map<string, { name: string; sets: typeof session.sets }>();
  for (const s of session.sets) {
    const g = byExercise.get(s.exerciseId) ?? { name: s.exercise.name, sets: [] };
    g.sets.push(s);
    byExercise.set(s.exerciseId, g);
  }
  const units = profile.unitSystem;
  const prCount = session.sets.reduce((n, s) => n + s.records.length, 0);

  return (
    <div className="space-y-7">
      <PageHeader
        title={session.planDay?.name ?? "Workout"}
        subtitle={`${formatLocalDate(session.localDate, { weekday: "long" })}${session.planDay ? `, ${session.planDay.plan.name}` : ""}`}
        action={<DeleteWorkoutButton sessionId={session.id} />}
      />
      <dl className="grid grid-cols-3 divide-x divide-line border-y border-line">
        {[
          { label: "Minutes", value: String(durationMinutes(session.startedAt, session.endedAt) ?? "–") },
          { label: `${weightUnit(units)} lifted`, value: Math.round(displayWeight(totalVolume(session.sets), units, 0)).toLocaleString() },
          { label: "Records", value: String(prCount) },
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
          <Link href={`/train/exercises/${exerciseId}`} className="display text-[20px] hover:underline">
            {g.name}
          </Link>
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-line text-[12px] text-steel">
                <th className="w-10 py-1 font-medium">Set</th>
                <th className="py-1 font-medium">{weightUnit(units)}</th>
                <th className="py-1 font-medium">Reps</th>
                <th className="py-1 font-medium">RPE</th>
                <th className="py-1 text-right font-medium">Est. 1RM</th>
              </tr>
            </thead>
            <tbody>
              {g.sets.map((s) => (
                <tr key={s.id} className="border-b border-line">
                  <td className="py-1.5 text-sm font-semibold text-steel">{s.isWarmup ? "W" : s.setIndex}</td>
                  <td className="score py-1.5 text-[22px]">{displayWeight(s.weightKg, units)}</td>
                  <td className="score py-1.5 text-[22px]">{s.reps}</td>
                  <td className="num py-1.5 text-sm text-steel">{s.rpe ?? "–"}</td>
                  <td className="num py-1.5 text-right text-sm">
                    {s.records.length > 0 && (
                      <Trophy className="mr-1 inline size-3.5" aria-label={`Record: ${s.records.map((r) => RECORD_LABELS[r.type]).join(", ")}`} />
                    )}
                    {s.isWarmup ? "–" : formatWeight(estimate1RM(s.weightKg, s.reps), units)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

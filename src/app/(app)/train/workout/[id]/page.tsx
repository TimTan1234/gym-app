import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { requireProfile } from "@/lib/session";
import { db } from "@/lib/db";
import { lastSessionSets } from "@/lib/queries";
import { WorkoutLogger, type Block } from "@/components/train/WorkoutLogger";
import { PageSkeleton } from "@/components/ui";

export const metadata = { title: "Workout" };

const exerciseSelect = { id: true, name: true, primaryMuscle: true, equipment: true, isLowerBody: true } as const;

async function Workout({ params }: { params: PageProps<"/train/workout/[id]">["params"] }) {
  const { id } = await params;
  const { user, profile } = await requireProfile();

  const session = await db.workoutSession.findFirst({
    where: { id, userId: user.id },
    include: {
      planDay: {
        include: {
          plan: { select: { name: true } },
          exercises: { orderBy: { order: "asc" }, include: { exercise: { select: exerciseSelect } } },
        },
      },
      sets: { orderBy: [{ completedAt: "asc" }], include: { exercise: { select: exerciseSelect } } },
    },
  });
  if (!session) notFound();
  if (session.endedAt) redirect(`/train/history/${session.id}`);

  const library = await db.exercise.findMany({
    where: { OR: [{ userId: null }, { userId: user.id }] },
    orderBy: { name: "asc" },
    select: exerciseSelect,
  });

  // Planned exercises first, then any extra exercises in the order first logged.
  const ordered = new Map<string, Omit<Block, "last">>();
  for (const pe of session.planDay?.exercises ?? []) {
    ordered.set(pe.exerciseId, {
      exercise: pe.exercise,
      target: { sets: pe.sets, repMin: pe.repMin, repMax: pe.repMax, restSec: pe.restSec, targetRpe: pe.targetRpe, notes: pe.notes },
    });
  }
  for (const s of session.sets) {
    if (!ordered.has(s.exerciseId)) ordered.set(s.exerciseId, { exercise: s.exercise, target: null });
  }

  const last = await lastSessionSets(user.id, [...ordered.keys()], session.id);
  const blocks: Block[] = [...ordered.values()].map((b) => ({ ...b, last: last.get(b.exercise.id) ?? null }));

  const title = session.planDay ? session.planDay.name : "Workout";

  return (
    <WorkoutLogger
      sessionId={session.id}
      startedAt={session.startedAt.toISOString()}
      title={title}
      initialBlocks={blocks}
      initialSets={session.sets.map((s) => ({
        id: s.id,
        exerciseId: s.exerciseId,
        setIndex: s.setIndex,
        weightKg: s.weightKg,
        reps: s.reps,
        rpe: s.rpe,
        isWarmup: s.isWarmup,
      }))}
      library={library}
      units={profile.unitSystem}
    />
  );
}

export default function WorkoutPage(props: PageProps<"/train/workout/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Workout params={props.params} />
    </Suspense>
  );
}

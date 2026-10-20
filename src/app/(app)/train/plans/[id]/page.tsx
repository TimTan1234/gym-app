import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/session";
import { db } from "@/lib/db";
import { PlanEditor, type EditorPlan } from "@/components/plans/PlanEditor";
import { PlanActions } from "@/components/plans/PlanActions";
import { PageHeader, PageSkeleton } from "@/components/ui";

export const metadata = { title: "Edit plan" };

async function EditPlan({ params }: { params: PageProps<"/train/plans/[id]">["params"] }) {
  const { id } = await params;
  const { user } = await requireProfile();
  const [plan, library] = await Promise.all([
    db.trainingPlan.findFirst({
      where: { id, userId: user.id },
      include: {
        days: {
          orderBy: { dayIndex: "asc" },
          include: { exercises: { orderBy: { order: "asc" }, include: { exercise: { select: { name: true } } } } },
        },
      },
    }),
    db.exercise.findMany({
      where: { OR: [{ userId: null }, { userId: user.id }] },
      orderBy: { name: "asc" },
      select: { id: true, name: true, primaryMuscle: true, equipment: true, isLowerBody: true },
    }),
  ]);
  if (!plan) notFound();

  const initial: EditorPlan = {
    name: plan.name,
    goal: plan.goal,
    weeks: plan.weeks,
    notes: plan.notes,
    source: plan.source,
    days: plan.days.map((d) => ({
      key: d.id,
      name: d.name,
      exercises: d.exercises.map((e) => ({
        key: e.id,
        exerciseId: e.exerciseId,
        exerciseName: e.exercise.name,
        sets: e.sets,
        repMin: e.repMin,
        repMax: e.repMax,
        targetRpe: e.targetRpe,
        restSec: e.restSec,
        notes: e.notes,
      })),
    })),
  };

  return (
    <>
      <PageHeader title={plan.name} subtitle={plan.isActive ? "Active plan" : "Inactive"} action={<PlanActions planId={plan.id} isActive={plan.isActive} />} />
      <PlanEditor key={plan.updatedAt.toISOString()} initial={initial} library={library} planId={plan.id} />
    </>
  );
}

export default function PlanPage(props: PageProps<"/train/plans/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EditPlan params={props.params} />
    </Suspense>
  );
}

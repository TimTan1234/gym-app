import { Suspense } from "react";
import { requireProfile } from "@/lib/session";
import { db } from "@/lib/db";
import { ExerciseLibrary } from "@/components/train/ExerciseLibrary";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { getT } from "@/i18n/server";

export const metadata = { title: "Exercises" };

async function Library() {
  const { user } = await requireProfile();
  const t = await getT();
  const exercises = await db.exercise.findMany({
    where: { OR: [{ userId: null }, { userId: user.id }] },
    orderBy: { name: "asc" },
    select: { id: true, slug: true, name: true, primaryMuscle: true, secondaryMuscles: true, equipment: true, category: true, userId: true },
  });
  const muscles = [...new Set(exercises.map((e) => e.primaryMuscle))].sort();
  const equipment = [...new Set(exercises.map((e) => e.equipment))].sort();
  return (
    <>
      <PageHeader title={t("train.exercises")} />
      <ExerciseLibrary
        exercises={exercises.map(({ userId, ...e }) => ({ ...e, custom: userId !== null }))}
        muscles={muscles}
        equipment={equipment}
      />
    </>
  );
}

export default function ExercisesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Library />
    </Suspense>
  );
}

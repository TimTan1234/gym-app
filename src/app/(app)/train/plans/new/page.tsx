import { Suspense } from "react";
import { requireProfile } from "@/lib/session";
import { db } from "@/lib/db";
import { NewPlan } from "@/components/plans/NewPlan";
import { PageHeader, PageSkeleton } from "@/components/ui";

export const metadata = { title: "New plan" };

async function New() {
  const { user, profile } = await requireProfile();
  const library = await db.exercise.findMany({
    where: { OR: [{ userId: null }, { userId: user.id }] },
    orderBy: { name: "asc" },
    select: { id: true, name: true, primaryMuscle: true, equipment: true, isLowerBody: true },
  });
  const goal = profile.goal === "CUT" ? "FAT_LOSS" : profile.goal === "BULK" ? "HYPERTROPHY" : "GENERAL_FITNESS";
  return <NewPlan library={library} defaults={{ experience: profile.experience, equipment: profile.equipment.filter((e) => e !== "cardio_machine"), goal }} />;
}

export default function NewPlanPage() {
  return (
    <>
      <PageHeader title="New plan" />
      <Suspense fallback={<PageSkeleton />}>
        <New />
      </Suspense>
    </>
  );
}

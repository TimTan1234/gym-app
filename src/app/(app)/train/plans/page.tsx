import { Suspense } from "react";
import Link from "next/link";
import { Plus, Sparkles } from "lucide-react";
import { requireProfile } from "@/lib/session";
import { db } from "@/lib/db";
import { PlanActions } from "@/components/plans/PlanActions";
import { Badge, EmptyState, PageHeader, PageSkeleton, buttonClass, cn } from "@/components/ui";

export const metadata = { title: "Training plans" };

async function Plans() {
  const { user } = await requireProfile();
  const plans = await db.trainingPlan.findMany({
    where: { userId: user.id },
    orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
    include: { days: { orderBy: { dayIndex: "asc" }, select: { name: true, _count: { select: { exercises: true } } } } },
  });
  if (plans.length === 0) {
    return (
      <EmptyState
        title="No plans yet"
        action={
          <Link href="/train/plans/new" className={buttonClass()}>
            <Sparkles className="size-4" /> Create your first plan
          </Link>
        }
      >
        Let AI design a plan around your goal, schedule and equipment, or build one yourself.
      </EmptyState>
    );
  }
  return (
    <ul className="divide-y divide-line border-y border-line">
      {plans.map((p) => (
        <li key={p.id} className={cn("py-4", p.isActive && "border-l-[3px] border-iron pl-3")}>
          <div className="flex items-start justify-between gap-2">
            <Link href={`/train/plans/${p.id}`} className="min-w-0 hover:underline">
              <p className="display text-[20px]">{p.name}</p>
            </Link>
            <div className="flex shrink-0 gap-1">
              {p.isActive && <Badge className="bg-iron text-iron-fg">Active</Badge>}
              {p.source === "AI" && <Badge><Sparkles className="mr-1 size-3" aria-hidden />AI</Badge>}
            </div>
          </div>
          <p className="text-[13px] text-steel">
            {p.daysPerWeek} days a week for {p.weeks} weeks: {p.days.map((d) => d.name).join(", ")}
          </p>
          <div className="mt-3">
            <PlanActions planId={p.id} isActive={p.isActive} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function PlansPage() {
  return (
    <>
      <PageHeader
        title="Plans"
        action={
          <Link href="/train/plans/new" className={buttonClass("primary", "sm")}>
            <Plus className="size-4" /> New
          </Link>
        }
      />
      <Suspense fallback={<PageSkeleton />}>
        <Plans />
      </Suspense>
    </>
  );
}

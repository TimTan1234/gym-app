import { Suspense } from "react";
import Link from "next/link";
import { Plus, Sparkles } from "lucide-react";
import { requireProfile } from "@/lib/session";
import { db } from "@/lib/db";
import { PlanActions } from "@/components/plans/PlanActions";
import { Badge, EmptyState, PageHeader, PageSkeleton, buttonClass, cn } from "@/components/ui";
import { getT } from "@/i18n/server";

export const metadata = { title: "Training plans" };

async function Plans() {
  const { user } = await requireProfile();
  const t = await getT();
  const plans = await db.trainingPlan.findMany({
    where: { userId: user.id },
    orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
    include: { days: { orderBy: { dayIndex: "asc" }, select: { name: true, _count: { select: { exercises: true } } } } },
  });
  const header = (
    <PageHeader
      title={t("plans.title")}
      action={
        <Link href="/train/plans/new" className={buttonClass("primary", "sm")}>
          <Plus className="size-4" /> {t("plans.new")}
        </Link>
      }
    />
  );
  if (plans.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title={t("plans.emptyTitle")}
          action={
            <Link href="/train/plans/new" className={buttonClass()}>
              <Sparkles className="size-4" /> {t("plans.emptyAction")}
            </Link>
          }
        >
          {t("plans.emptyBody")}
        </EmptyState>
      </>
    );
  }
  return (
    <>
      {header}
      <ul className="divide-y divide-line border-y border-line">
        {plans.map((p) => (
          <li key={p.id} className={cn("py-4", p.isActive && "border-l-[3px] border-iron pl-3")}>
            <div className="flex items-start justify-between gap-2">
              <Link href={`/train/plans/${p.id}`} className="min-w-0 hover:underline">
                <p className="display text-[20px]">{p.name}</p>
              </Link>
              <div className="flex shrink-0 gap-1">
                {p.isActive && <Badge className="bg-iron text-iron-fg">{t("plans.active")}</Badge>}
                {p.source === "AI" && <Badge><Sparkles className="mr-1 size-3" aria-hidden />{t("plans.ai")}</Badge>}
              </div>
            </div>
            <p className="text-[13px] text-steel">
              {t("plans.summary", { days: p.daysPerWeek, weeks: p.weeks, dayNames: p.days.map((d) => d.name).join(t.locale === "zh" ? "、" : ", ") })}
            </p>
            <div className="mt-3">
              <PlanActions planId={p.id} isActive={p.isActive} />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function PlansPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Plans />
    </Suspense>
  );
}

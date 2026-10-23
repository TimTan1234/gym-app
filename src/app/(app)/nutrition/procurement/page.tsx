import { Suspense } from "react";
import Link from "next/link";
import { ChevronLeft, FilePlus2, Sparkles, Upload } from "lucide-react";
import { requireProfile } from "@/lib/session";
import { listProcurementPlans } from "@/lib/procurement/queries";
import { formatMoney, planCost } from "@/lib/procurement/summary";
import { EmptyState, PageHeader, PageSkeleton, ProgressBar, buttonClass, cn } from "@/components/ui";
import { getT } from "@/i18n/server";
import type { T } from "@/i18n/translate";

export const metadata = { title: "Groceries" };

type PlanSummary = Awaited<ReturnType<typeof listProcurementPlans>>[number];

/** A plan as a small slip: what it will cost against the budget, and how much is in the basket. */
function PlanRow({ plan, t }: { plan: PlanSummary; t: T }) {
  const done = plan.items.filter((i) => i.checked).length;
  const cost = planCost(plan.items, plan.budget);
  const money = (n: number) => formatMoney(n, plan.currency, t.locale);
  return (
    <li>
      <Link href={`/nutrition/procurement/${plan.id}`} className="slip block space-y-2 px-4 pt-3 transition-opacity hover:opacity-90" data-testid="procurement-plan">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="display truncate text-[19px]">{plan.title}</p>
            <p className="text-[13px] text-steel">
              {t("procurement.periodFor", { days: t.plural("procurement.days", plan.days), people: t.plural("procurement.people", plan.people) })}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="score text-[26px]">{money(cost.projected)}</p>
            {plan.budget != null && (
              <p className={cn("text-[12px]", cost.overBudget ? "font-semibold text-alert" : "text-steel")}>
                {cost.overBudget
                  ? t("procurement.budget.over", { amount: money(-(cost.remaining ?? 0)) })
                  : t("procurement.shop.ofBudget", { budget: money(plan.budget) })}
              </p>
            )}
          </div>
        </div>
        <ProgressBar value={done} max={plan.items.length} />
        <p className="text-[13px] text-steel">{t("procurement.shop.progress", { done, total: plan.items.length })}</p>
      </Link>
    </li>
  );
}

async function Plans() {
  const { user } = await requireProfile();
  const [plans, t] = await Promise.all([listProcurementPlans(user.id), getT()]);
  const active = plans.filter((p) => p.status === "ACTIVE");
  const past = plans.filter((p) => p.status !== "ACTIVE");

  return (
    <>
      <Link href="/nutrition" className={cn(buttonClass("ghost", "sm", "start"), "mb-2")}>
        <ChevronLeft className="size-4" /> {t("nutrition.title")}
      </Link>
      <PageHeader title={t("procurement.title")} subtitle={t("procurement.subtitle")} />
      <div className="mb-8 grid grid-cols-3 gap-2">
        <Link href="/nutrition/procurement/new?mode=import" className={cn(buttonClass("primary"), "h-auto flex-col gap-1 py-3 text-sm")}>
          <Upload className="size-5" /> {t("procurement.import")}
        </Link>
        <Link href="/nutrition/procurement/new?mode=generate" className={cn(buttonClass("secondary"), "h-auto flex-col gap-1 py-3 text-sm")}>
          <Sparkles className="size-5" /> {t("procurement.generate")}
        </Link>
        <Link href="/nutrition/procurement/new?mode=blank" className={cn(buttonClass("secondary"), "h-auto flex-col gap-1 py-3 text-sm")}>
          <FilePlus2 className="size-5" /> {t("procurement.blank")}
        </Link>
      </div>

      {active.length === 0 ? (
        <EmptyState title={t("procurement.emptyTitle")}>{t("procurement.emptyBody")}</EmptyState>
      ) : (
        <section>
          <h2 className="display mb-3 text-[20px]">{t("procurement.activePlans")}</h2>
          <ul className="space-y-4">
            {active.map((p) => (
              <PlanRow key={p.id} plan={p} t={t} />
            ))}
          </ul>
        </section>
      )}

      {past.length > 0 && (
        <details className="mt-8">
          <summary className="cursor-pointer text-sm font-semibold text-steel">{t("procurement.pastPlans", { count: past.length })}</summary>
          <ul className="mt-3 space-y-4">
            {past.map((p) => (
              <PlanRow key={p.id} plan={p} t={t} />
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

export default function ProcurementPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Plans />
    </Suspense>
  );
}

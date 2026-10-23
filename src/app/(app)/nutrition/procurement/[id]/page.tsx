import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireProfile } from "@/lib/session";
import { getProcurementPlan, type ProcurementPlanDetail } from "@/lib/procurement/queries";
import { checkProfileOf, formatMoney, hasNutrients, planCost, planNutrition, type CheckProfile } from "@/lib/procurement/summary";
import { ShoppingList } from "@/components/procurement/ShoppingList";
import { NutritionCheck } from "@/components/procurement/NutritionCheck";
import { EstimateButton, PlanMenu, SaveToFoodsButton } from "@/components/procurement/PlanActions";
import { Badge, PageHeader, PageSkeleton, ProgressBar, buttonClass, cn } from "@/components/ui";
import { getT } from "@/i18n/server";
import type { T } from "@/i18n/translate";

export const metadata = { title: "Grocery plan" };

const VIEWS = ["shop", "meals", "nutrition", "budget"] as const;

async function PlanDetail({ params, searchParams }: PageProps<"/nutrition/procurement/[id]">) {
  const { user, profile } = await requireProfile();
  const [{ id }, sp, t] = await Promise.all([params, searchParams, getT()]);
  const plan = await getProcurementPlan(user.id, id);
  if (!plan) notFound();
  const view = VIEWS.find((v) => v === sp.view) ?? "shop";

  return (
    <>
      <Link href="/nutrition/procurement" className={cn(buttonClass("ghost", "sm", "start"), "mb-2")}>
        <ChevronLeft className="size-4" /> {t("procurement.title")}
      </Link>
      <PageHeader
        title={plan.title}
        subtitle={
          <>
            {`${t.plural("procurement.days", plan.days)} · ${t.plural("procurement.people", plan.people)}`}
            {plan.status !== "ACTIVE" && <Badge className="ml-2">{t(`procurement.status.${plan.status}`)}</Badge>}
          </>
        }
        action={<PlanMenu plan={plan} />}
      />
      <nav className="mb-5 grid grid-cols-4 gap-1 rounded-[10px] bg-wash p-1" aria-label={t("procurement.viewsLabel")}>
        {VIEWS.map((v) => (
          <Link
            key={v}
            href={v === "shop" ? `/nutrition/procurement/${plan.id}` : `/nutrition/procurement/${plan.id}?view=${v}`}
            scroll={false}
            aria-current={v === view ? "page" : undefined}
            className={cn(
              "rounded-[8px] py-1.5 text-center text-[13px] font-semibold",
              v === view ? "bg-paper text-iron shadow-sm" : "text-steel hover:text-iron",
            )}
          >
            {t(`procurement.views.${v}`)}
          </Link>
        ))}
      </nav>
      {view === "shop" && <ShoppingList key={plan.id} planId={plan.id} items={plan.items} currency={plan.currency} budget={plan.budget} />}
      {view === "meals" && <MealsView plan={plan} t={t} />}
      {view === "nutrition" && <NutritionView plan={plan} profile={checkProfileOf(profile)} t={t} />}
      {view === "budget" && <BudgetView plan={plan} t={t} />}
    </>
  );
}

function MealsView({ plan, t }: { plan: ProcurementPlanDetail; t: T }) {
  if (plan.meals.length === 0) return <p className="text-sm text-steel">{t("procurement.meals.none")}</p>;
  const days = [...new Set(plan.meals.map((m) => m.day))];
  return (
    <div className="space-y-5">
      <p className="text-sm text-steel">{t("procurement.meals.hint")}</p>
      {days.map((day) => (
        <section key={day}>
          <h2 className="display mb-1 text-[18px]">{t("procurement.dayN", { day })}</h2>
          <ul className="divide-y divide-line border-y border-line">
            {plan.meals
              .filter((m) => m.day === day)
              .map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="w-20 shrink-0 text-steel">{t(`labels.mealType.${m.mealType}`)}</span>
                  <span className="min-w-0 flex-1">{m.description}</span>
                  <Link
                    href={`/nutrition/log?type=${m.mealType}&text=${encodeURIComponent(m.description)}`}
                    className={buttonClass("ghost", "sm", "end")}
                    aria-label={t("procurement.meals.logNamed", { name: m.description })}
                  >
                    {t("procurement.meals.log")}
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function NutritionView({ plan, profile, t }: { plan: ProcurementPlanDetail; profile: CheckProfile; t: T }) {
  const { perDay, missing } = planNutrition(plan.items, plan.days);
  const food = plan.items.filter((i) => hasNutrients(i) && (i.consumedGrams ?? 0) > 0);
  // Bought food first; before shopping, everything on the list.
  const bought = food.filter((i) => i.checked);
  const toSave = (bought.length > 0 ? bought : food).filter((i) => !i.savedFoodId);

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="display text-[20px]">{t("procurement.nutrition.perDayTitle")}</h2>
        <p className="text-sm text-steel">{t("procurement.nutrition.hint", { days: plan.days })}</p>
        {missing < plan.items.length && <NutritionCheck perDay={perDay} profile={profile} />}
        {missing > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs text-steel">{t("procurement.nutrition.missing", { count: missing })}</p>
            <EstimateButton planId={plan.id} count={missing} />
          </div>
        )}
      </section>
      <section className="space-y-2 border-t border-line pt-5">
        <h2 className="display text-[20px]">{t("procurement.nutrition.savedFoodsTitle")}</h2>
        <p className="text-sm text-steel">{t("procurement.nutrition.savedFoodsHint")}</p>
        <SaveToFoodsButton planId={plan.id} itemIds={toSave.map((i) => i.id)} />
      </section>
    </div>
  );
}

function BudgetView({ plan, t }: { plan: ProcurementPlanDetail; t: T }) {
  const cost = planCost(plan.items, plan.budget);
  const money = (n: number) => formatMoney(n, plan.currency, t.locale);
  const rows = [
    { label: t("procurement.budget.estimated"), value: money(cost.estimated) },
    { label: t("procurement.budget.spent"), value: money(cost.spent) },
    { label: t("procurement.budget.projected"), value: money(cost.projected) },
  ];

  return (
    <div className="space-y-6" data-testid="budget-view">
      <section className="space-y-3">
        {plan.budget != null ? (
          <>
            <div className="flex items-baseline justify-between">
              <span className="score text-[30px]">{money(cost.projected)}</span>
              <span className="num text-sm text-steel">{t("procurement.budget.ofBudget", { budget: money(plan.budget) })}</span>
            </div>
            <ProgressBar value={cost.projected} max={plan.budget} color={cost.overBudget ? "var(--alert)" : "var(--iron)"} />
            <p className={cn("text-sm", cost.overBudget ? "font-semibold text-alert" : "text-steel")}>
              {cost.overBudget
                ? t("procurement.budget.over", { amount: money(-(cost.remaining ?? 0)) })
                : t("procurement.budget.left", { amount: money(cost.remaining ?? 0) })}
            </p>
          </>
        ) : (
          <p className="text-sm text-steel">{t("procurement.budget.setHint")}</p>
        )}
        <dl className="divide-y divide-line border-y border-line text-sm">
          {rows.map((r) => (
            <div key={r.label} className="flex justify-between py-2">
              <dt className="text-steel">{r.label}</dt>
              <dd className="num font-medium">{r.value}</dd>
            </div>
          ))}
        </dl>
        {cost.unpriced > 0 && <p className="text-xs text-steel">{t("procurement.budget.unpriced", { count: cost.unpriced })}</p>}
      </section>
      {cost.byCategory.length > 0 && (
        <section>
          <h2 className="display mb-2 text-[20px]">{t("procurement.budget.byCategory")}</h2>
          <ul className="space-y-2.5">
            {cost.byCategory.map((c) => (
              <li key={c.category} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>{t(`labels.groceryCategory.${c.category}`)}</span>
                  <span className="num text-steel">{money(c.amount)}</span>
                </div>
                <ProgressBar value={c.amount} max={cost.projected} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default function ProcurementPlanPage(props: PageProps<"/nutrition/procurement/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PlanDetail {...props} />
    </Suspense>
  );
}

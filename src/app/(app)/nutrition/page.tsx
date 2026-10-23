import { Suspense } from "react";
import Link from "next/link";
import { Plus, ShoppingBasket } from "lucide-react";
import { requireProfile } from "@/lib/session";
import { getDayNutrition } from "@/lib/queries";
import { addDays, isLocalDate, todayLocal } from "@/lib/dates";
import { MacroSummary } from "@/components/nutrition/MacroSummary";
import { MealCard } from "@/components/nutrition/MealCard";
import { CopyDayBefore } from "@/components/nutrition/CopyDayBefore";
import { DateNav } from "@/components/DateNav";
import { AfterMealPrompt } from "@/components/glucose/GlucoseBits";
import { afterMealReadings, mealDueForCheck } from "@/lib/glucose-queries";
import { budgetFor, carbBudget } from "@/lib/nutrition/diabetes";
import { CarbBudgetLine } from "@/components/nutrition/CarbBudget";
import { PageSkeleton, buttonClass, cn } from "@/components/ui";
import { getT } from "@/i18n/server";

export const metadata = { title: "Nutrition" };

const ORDER = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"] as const;

async function NutritionDay({ searchParams }: { searchParams: PageProps<"/nutrition">["searchParams"] }) {
  const { user, profile } = await requireProfile();
  const today = todayLocal(profile.timezone);
  const raw = (await searchParams).date;
  const date = typeof raw === "string" && isLocalDate(raw) && raw <= today ? raw : today;
  const [{ meals, totals }, dayBefore, t] = await Promise.all([getDayNutrition(user.id, date), getDayNutrition(user.id, addDays(date, -1)), getT()]);
  const diabetes = profile.diabetesMode;
  const budget = diabetes ? carbBudget(profile.sex, profile.activityLevel) : null;
  const [glucoseByMeal, dueForCheck] = diabetes
    ? await Promise.all([afterMealReadings(user.id, meals, profile), date === today ? mealDueForCheck(user.id, today, profile) : null])
    : [null, null];

  return (
    <>
      <header className="mb-6 flex items-center justify-between gap-2">
        <h1 className="display text-[32px]">{t("nutrition.title")}</h1>
        <div className="flex items-center gap-1">
          <Link href="/nutrition/procurement" className={buttonClass("ghost", "sm")} aria-label={t("procurement.title")}>
            <ShoppingBasket className="size-4" />
            <span className="hidden sm:inline">{t("procurement.title")}</span>
          </Link>
          <DateNav date={date} today={today} basePath="/nutrition" />
        </div>
      </header>
      <MacroSummary totals={totals} targets={profile} />
      {dueForCheck && (
        <div className="mt-6">
          <AfterMealPrompt meal={dueForCheck} />
        </div>
      )}
      <div className="mb-20 mt-10 space-y-6">
        {ORDER.map((type) => {
          const group = meals.filter((m) => m.mealType === type);
          const kcal = group.reduce((s, m) => s + m.kcal, 0);
          const before = dayBefore.meals.filter((m) => m.mealType === type);
          return (
            <section key={type}>
              <div className="mb-1 flex items-baseline justify-between">
                <h2 className={cn("display text-[20px]", group.length === 0 && "text-steel")}>
                  {t(`labels.mealType.${type}`)}
                  {group.length > 0 && (
                    <span className="num ml-2 font-sans text-sm font-normal text-steel">
                      {Math.round(kcal)} {t("common.kcal")}
                    </span>
                  )}
                </h2>
                <Link href={`/nutrition/log?type=${type}&date=${date}`} className={buttonClass("ghost", "sm", "end")} aria-label={t("nutrition.addMealType", { type: t(`labels.mealType.${type}`) })}>
                  <Plus className="size-4" /> {t("common.add")}
                </Link>
              </div>
              {budget && group.length > 0 && (
                <CarbBudgetLine carbs={group.reduce((s, m) => s + m.carbsG, 0)} range={budgetFor(budget, type)} className="mb-1 block" />
              )}
              <div className={group.length > 0 ? "border-b border-line" : undefined}>
                {group.map((meal) => (
                  <MealCard
                    key={meal.id}
                    meal={meal}
                    canCopy={date !== today}
                    glucose={glucoseByMeal ? { readings: glucoseByMeal.get(meal.id) ?? [], unit: profile.glucoseUnit } : undefined}
                  />
                ))}
              </div>
              {group.length === 0 && before.length > 0 && (
                <CopyDayBefore
                  date={date}
                  mealType={type}
                  kcal={before.reduce((s, m) => s + m.kcal, 0)}
                  label={t(date === today ? "nutrition.sameAsYesterday" : "nutrition.sameAsDayBefore", {
                    meals: before.map((m) => m.description).join(t.locale === "zh" ? "、" : ", "),
                  })}
                />
              )}
            </section>
          );
        })}
      </div>
      <Link
        href={`/nutrition/log?date=${date}`}
        className={`${buttonClass("primary", "lg")} fixed bottom-24 right-4 z-30 shadow-[0_8px_24px_-10px_rgba(31,34,38,0.55)] md:bottom-8`}
      >
        <Plus className="size-5" /> {t("nutrition.logMeal")}
      </Link>
    </>
  );
}

export default function NutritionPage(props: PageProps<"/nutrition">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NutritionDay searchParams={props.searchParams} />
    </Suspense>
  );
}

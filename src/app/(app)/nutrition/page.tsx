import { Suspense } from "react";
import Link from "next/link";
import { Plus, ShoppingBasket } from "lucide-react";
import { requireProfile } from "@/lib/session";
import { getActivity, getDayNutrition, getLatestWeight, stepBonusWindow } from "@/lib/queries";
import { stepBonusFor } from "@/lib/activity";
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

const SLOTS = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"] as const;

async function NutritionDay({ searchParams }: { searchParams: PageProps<"/nutrition">["searchParams"] }) {
  const { user, profile } = await requireProfile();
  const today = todayLocal(profile.timezone);
  const raw = (await searchParams).date;
  const date = typeof raw === "string" && isLocalDate(raw) && raw <= today ? raw : today;
  const [{ meals, totals }, dayBefore, activity, weight, t] = await Promise.all([
    getDayNutrition(user.id, date),
    getDayNutrition(user.id, addDays(date, -1)),
    profile.targetsManual ? [] : getActivity(user.id, ...stepBonusWindow(date)),
    getLatestWeight(user.id),
    getT(),
  ]);
  // A busier-than-usual day of steps (from the linked phone) raises that day's calorie target.
  const bonus = stepBonusFor(activity, date, weight?.weightKg);
  const diabetes = profile.diabetesMode;
  const budget = diabetes ? carbBudget(profile.sex, profile.activityLevel) : null;
  const [glucoseByMeal, dueForCheck] = diabetes
    ? await Promise.all([afterMealReadings(user.id, meals, profile), date === today ? mealDueForCheck(user.id, today, profile) : null])
    : [null, null];

  // On today the rail is solid up to the last meal logged and dashed for what's still to come;
  // a past day is complete, so all solid.
  const lastLogged = date === today ? Math.max(-1, ...SLOTS.map((type, i) => (meals.some((m) => m.mealType === type) ? i : -1))) : SLOTS.length - 1;

  function slot(type: (typeof SLOTS)[number], i: number) {
    const group = meals.filter((m) => m.mealType === type);
    const kcal = group.reduce((s, m) => s + m.kcal, 0);
    const before = dayBefore.meals.filter((m) => m.mealType === type);
    const name = t(`labels.mealType.${type}`);
    return (
      <section key={type} className="relative pl-8">
        {/* Stop: filled once the meal is logged. The segment below runs to the next stop (24px gap + its 18px centre). */}
        <span
          aria-hidden
          className={cn("absolute left-[3px] top-[11px] size-3.5 rounded-full", group.length > 0 ? "bg-iron" : "border-2 border-steel/45 bg-chalk")}
        />
        {i < SLOTS.length - 1 && (
          <span
            aria-hidden
            className={cn("absolute left-[9px] top-[29px] -bottom-[35px] border-l-2", i + 1 <= lastLogged ? "border-iron/35" : "border-dashed border-steel/35")}
          />
        )}
        <div className="flex min-h-9 items-center justify-between gap-3">
          <h2 className={cn("display text-[20px]", group.length === 0 && "text-steel")}>{name}</h2>
          {group.length > 0 && (
            <span className="num text-sm text-steel">
              {Math.round(kcal)} {t("common.kcal")}
            </span>
          )}
        </div>
        {budget && group.length > 0 && <CarbBudgetLine carbs={group.reduce((s, m) => s + m.carbsG, 0)} range={budgetFor(budget, type)} className="mb-1 block" />}
        {group.length > 0 && (
          <div className="border-b border-line">
            {group.map((meal) => (
              <MealCard
                key={meal.id}
                meal={meal}
                canCopy={date !== today}
                glucose={glucoseByMeal ? { readings: glucoseByMeal.get(meal.id) ?? [], unit: profile.glucoseUnit } : undefined}
              />
            ))}
          </div>
        )}
        {/* Add sits on the left, on the rail: the floating Log meal button is on the right. */}
        <Link
          href={`/nutrition/log?type=${type}&date=${date}`}
          className={cn(buttonClass("ghost", "sm", "start"), "mt-1")}
          aria-label={t("nutrition.addMealType", { type: name })}
        >
          <Plus className="size-4" /> {t("nutrition.addMealType", { type: t.locale === "en" ? name.toLowerCase() : name })}
        </Link>
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
  }

  return (
    <>
      {/* As in PageHeader, the actions wrap under the title on narrow phones rather than push the page wider. */}
      <header className="mb-6 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <h1 className="display text-[34px]">{t("nutrition.title")}</h1>
        <div className="ml-auto flex items-center gap-1">
          <Link href="/nutrition/procurement" className={buttonClass("ghost", "sm")} aria-label={t("procurement.title")}>
            <ShoppingBasket className="size-4" />
            <span className="hidden sm:inline">{t("procurement.title")}</span>
          </Link>
          <DateNav date={date} today={today} basePath="/nutrition" />
        </div>
      </header>
      <MacroSummary totals={totals} targets={profile} past={date !== today} bonus={bonus} />
      {dueForCheck && (
        <div className="mt-6">
          <AfterMealPrompt meal={dueForCheck} />
        </div>
      )}
      <div className="mb-20 mt-10">
        {/* The day's meals on one rail, snack last. */}
        <div className="space-y-6">{SLOTS.map((type, i) => slot(type, i))}</div>
      </div>
      <Link
        href={`/nutrition/log?date=${date}`}
        data-toasts-above
        className={`${buttonClass("primary", "lg")} fixed bottom-24 right-4 z-30 shadow-[0_8px_24px_-10px_rgba(20,20,19,0.55)] md:bottom-8`}
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

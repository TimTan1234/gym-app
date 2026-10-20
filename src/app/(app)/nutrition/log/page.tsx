import { Suspense } from "react";
import { requireProfile } from "@/lib/session";
import { db } from "@/lib/db";
import { addDays, isLocalDate, todayLocal, formatLocalDate } from "@/lib/dates";
import { getT } from "@/i18n/server";
import { INTL_LOCALE } from "@/i18n/config";
import { MealLogger } from "@/components/nutrition/MealLogger";
import { PageHeader, PageSkeleton } from "@/components/ui";

export const metadata = { title: "Log meal" };

const TYPES = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"] as const;

async function LogMeal({ searchParams }: { searchParams: PageProps<"/nutrition/log">["searchParams"] }) {
  const { user, profile } = await requireProfile();
  const sp = await searchParams;
  const today = todayLocal(profile.timezone);
  const date = typeof sp.date === "string" && isLocalDate(sp.date) && sp.date <= today ? sp.date : today;
  const type = TYPES.find((t) => t === sp.type) ?? null;

  const itemSelect = {
    name: true,
    quantity: true,
    unit: true,
    grams: true,
    kcal: true,
    proteinG: true,
    carbsG: true,
    fatG: true,
    fiberG: true,
    sugarG: true,
    sodiumMg: true,
  } as const;

  const [savedFoods, recent, t] = await Promise.all([
    db.savedFood.findMany({
      where: { userId: user.id },
      orderBy: [{ useCount: "desc" }, { updatedAt: "desc" }],
      take: 24,
      select: { id: true, ...itemSelect },
    }),
    db.meal.findMany({
      where: { userId: user.id, localDate: { gte: addDays(today, -30) } },
      orderBy: { eatenAt: "desc" },
      take: 40,
      select: { id: true, description: true, mealType: true, kcal: true, items: { select: itemSelect } },
    }),
    getT(),
  ]);

  // Most recent first, one entry per distinct meal name.
  const seen = new Set<string>();
  const recentMeals = recent
    .filter((m) => {
      const key = m.description.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);

  return (
    <>
      <PageHeader
        title={t("nutrition.logTitle")}
        subtitle={date === today ? t("common.today") : formatLocalDate(date, undefined, INTL_LOCALE[t.locale])}
      />
      <MealLogger date={date} isToday={date === today} initialType={type} savedFoods={savedFoods} recentMeals={recentMeals} />
    </>
  );
}

export default function LogMealPage(props: PageProps<"/nutrition/log">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <LogMeal searchParams={props.searchParams} />
    </Suspense>
  );
}

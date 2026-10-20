import { Suspense } from "react";
import { requireProfile } from "@/lib/session";
import { db } from "@/lib/db";
import { isLocalDate, todayLocal, formatLocalDate } from "@/lib/dates";
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

  const savedFoods = await db.savedFood.findMany({
    where: { userId: user.id },
    orderBy: [{ useCount: "desc" }, { updatedAt: "desc" }],
    take: 24,
    select: {
      id: true,
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
    },
  });

  return (
    <>
      <PageHeader title="Log a meal" subtitle={date === today ? "Today" : formatLocalDate(date)} />
      <MealLogger date={date} isToday={date === today} initialType={type} savedFoods={savedFoods} />
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

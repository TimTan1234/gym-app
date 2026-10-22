import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/session";
import { db } from "@/lib/db";
import { addDays, isLocalDate, todayLocal, formatLocalDate, toLocalTime } from "@/lib/dates";
import { getT } from "@/i18n/server";
import { INTL_LOCALE } from "@/i18n/config";
import { MealLogger, type EditableMeal } from "@/components/nutrition/MealLogger";
import { PageHeader, PageSkeleton } from "@/components/ui";

export const metadata = { title: "Log meal" };

const TYPES = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"] as const;

async function LogMeal({ searchParams }: { searchParams: PageProps<"/nutrition/log">["searchParams"] }) {
  const { user, profile } = await requireProfile();
  const sp = await searchParams;
  const today = todayLocal(profile.timezone);
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
    addedSugarG: true,
    sodiumMg: true,
  } as const;

  // ?meal=<id> opens a logged meal for editing, on its own day.
  const editId = typeof sp.meal === "string" ? sp.meal : null;
  const editing = editId
    ? await db.meal.findFirst({
        where: { id: editId, userId: user.id },
        select: {
          id: true,
          localDate: true,
          eatenAt: true,
          mealType: true,
          description: true,
          source: true,
          notes: true,
          items: { select: { id: true, ...itemSelect, confidence: true, assumptions: true }, orderBy: { id: "asc" } },
        },
      })
    : null;
  if (editId && !editing) notFound();
  const editable: EditableMeal | null = editing && {
    id: editing.id,
    mealType: editing.mealType,
    description: editing.description,
    source: editing.source,
    notes: editing.notes,
    items: editing.items.map(({ id: _id, ...item }) => item),
  };
  const date = editing?.localDate ?? (typeof sp.date === "string" && isLocalDate(sp.date) && sp.date <= today ? sp.date : today);

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
        title={editing ? t("nutrition.editTitle") : t("nutrition.logTitle")}
        subtitle={date === today ? t("common.today") : formatLocalDate(date, undefined, INTL_LOCALE[t.locale])}
      />
      <MealLogger
        // Saving an edit recreates the items, so the key changes and a later edit starts from fresh data.
        key={editing ? `${editing.id}:${editing.items.map((i) => i.id).join(",")}` : "new"}
        date={date}
        isToday={date === today}
        initialType={type}
        savedFoods={savedFoods}
        recentMeals={recentMeals.filter((m) => m.id !== editing?.id)}
        editing={editable}
        eatenTime={
          !profile.diabetesMode
            ? null
            : editing
              ? toLocalTime(editing.eatenAt, profile.timezone)
              : date === today
                ? toLocalTime(new Date(), profile.timezone)
                : "12:00"
        }
      />
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

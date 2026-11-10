import type { NextRequest } from "next/server";
import { getUserForApi } from "@/lib/session";
import { db } from "@/lib/db";
import { DATASETS, bodyCsv, glucoseCsv, mealsCsv, workoutsCsv, type Dataset } from "@/lib/export";
import { getT } from "@/i18n/server";

const NUTRIENTS = { kcal: true, proteinG: true, carbsG: true, fatG: true, fiberG: true, sugarG: true, addedSugarG: true, sodiumMg: true } as const;

async function csvFor(userId: string, dataset: Dataset): Promise<string> {
  switch (dataset) {
    case "meals":
      return mealsCsv(
        await db.meal.findMany({
          where: { userId },
          orderBy: { eatenAt: "asc" },
          select: {
            localDate: true,
            eatenAt: true,
            mealType: true,
            description: true,
            notes: true,
            ...NUTRIENTS,
            items: { orderBy: { id: "asc" }, select: { name: true, quantity: true, unit: true, grams: true, gi: true, ...NUTRIENTS } },
          },
        }),
      );
    case "body":
      return bodyCsv(await db.bodyMetric.findMany({ where: { userId }, orderBy: { localDate: "asc" } }));
    case "workouts": {
      const sessions = await db.workoutSession.findMany({
        where: { userId, endedAt: { not: null } },
        orderBy: { startedAt: "asc" },
        include: {
          planDay: { select: { name: true } },
          sets: { orderBy: { completedAt: "asc" }, include: { exercise: { select: { name: true } } } },
        },
      });
      return workoutsCsv(sessions.map((s) => ({ ...s, name: s.planDay?.name ?? null, sets: s.sets.map((x) => ({ ...x, exercise: x.exercise.name })) })));
    }
    case "glucose":
      return glucoseCsv(await db.glucoseReading.findMany({ where: { userId }, orderBy: { measuredAt: "asc" } }));
  }
}

/** The signed-in user's own data as a CSV download. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/export/[dataset]">) {
  const [user, t, { dataset }] = await Promise.all([getUserForApi(), getT(), ctx.params]);
  if (!user) return Response.json({ error: t("common.unauthorized") }, { status: 401 });
  if (!(DATASETS as readonly string[]).includes(dataset)) return Response.json({ error: t("common.notFound") }, { status: 404 });
  return new Response(await csvFor(user.id, dataset as Dataset), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="gympal-${dataset}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

import "server-only";
import { db } from "@/lib/db";

/** The user's plans, newest first, with what the list cards need. */
export async function listProcurementPlans(userId: string) {
  return db.procurementPlan.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      title: true,
      status: true,
      days: true,
      people: true,
      budget: true,
      currency: true,
      createdAt: true,
      items: { select: { category: true, estPrice: true, actualPrice: true, checked: true } },
    },
  });
}

export async function getProcurementPlan(userId: string, id: string) {
  return db.procurementPlan.findFirst({
    where: { id, userId },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      meals: { orderBy: [{ day: "asc" }, { sortOrder: "asc" }] },
    },
  });
}

export type ProcurementPlanDetail = NonNullable<Awaited<ReturnType<typeof getProcurementPlan>>>;
export type ProcurementItemRow = ProcurementPlanDetail["items"][number];

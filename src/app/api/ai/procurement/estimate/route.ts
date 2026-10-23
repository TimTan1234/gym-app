import { z } from "zod";
import { db } from "@/lib/db";
import { getUserForApi } from "@/lib/session";
import { AiLimitError, reserveAiCall } from "@/lib/ai/client";
import { estimateItems } from "@/lib/ai/procurement";
import { todayLocal } from "@/lib/dates";
import { getLocale, getT } from "@/i18n/server";

const BodySchema = z.object({ planId: z.string().min(1).max(40) });

/** Fills in nutrition for a plan's items that were typed in by hand. */
export async function POST(request: Request) {
  const [user, t, locale] = await Promise.all([getUserForApi(), getT(), getLocale()]);
  if (!user) return Response.json({ error: t("common.unauthorized") }, { status: 401 });

  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: t("procurement.errors.invalidRequest") }, { status: 400 });

  const plan = await db.procurementPlan.findFirst({
    where: { id: body.data.planId, userId: user.id },
    select: {
      days: true,
      people: true,
      user: { select: { profile: { select: { timezone: true } } } },
      items: { where: { kcal: null }, orderBy: { sortOrder: "asc" }, take: 80, select: { id: true, name: true, quantity: true, unit: true } },
    },
  });
  if (!plan) return Response.json({ error: t("procurement.errors.planNotFound") }, { status: 404 });
  if (plan.items.length === 0) return Response.json({ updated: 0 });

  let reservation;
  try {
    reservation = await reserveAiCall(user.id, "PROCUREMENT", todayLocal(plan.user.profile?.timezone ?? "UTC"));
  } catch (e) {
    if (e instanceof AiLimitError) return Response.json({ error: t("common.aiLimit", { limit: e.limit }) }, { status: 429 });
    throw e;
  }

  try {
    const estimates = await estimateItems(plan.items, plan, locale);
    const updates = plan.items.flatMap((item, index) => {
      const est = estimates.get(index);
      if (!est) return [];
      const { index: _index, ...data } = est;
      return [db.procurementItem.update({ where: { id: item.id }, data })];
    });
    await db.$transaction(updates);
    return Response.json({ updated: updates.length, remaining: reservation.remaining });
  } catch (e) {
    await reservation.refund();
    console.error("procurement estimate failed", e);
    return Response.json({ error: t("procurement.errors.estimateFailed") }, { status: 502 });
  }
}

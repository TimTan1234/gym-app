import { db } from "@/lib/db";
import { getUserForApi } from "@/lib/session";
import { AiLimitError, reserveAiCall } from "@/lib/ai/client";
import { PROCUREMENT_PROFILE_SELECT, ProcurementTooLongError, generateProcurement } from "@/lib/ai/procurement";
import { ProcurementGenerateSchema } from "@/lib/ai/schemas";
import { todayLocal } from "@/lib/dates";
import { getLocale, getT } from "@/i18n/server";

export async function POST(request: Request) {
  const [user, t, locale] = await Promise.all([getUserForApi(), getT(), getLocale()]);
  if (!user) return Response.json({ error: t("common.unauthorized") }, { status: 401 });

  const body = ProcurementGenerateSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: t("procurement.errors.invalidRequest") }, { status: 400 });

  const profile = await db.profile.findUnique({ where: { userId: user.id }, select: PROCUREMENT_PROFILE_SELECT });
  if (!profile) return Response.json({ error: t("common.unauthorized") }, { status: 401 });
  let reservation;
  try {
    reservation = await reserveAiCall(user.id, "PROCUREMENT", todayLocal(profile.timezone));
  } catch (e) {
    if (e instanceof AiLimitError) return Response.json({ error: t("common.aiLimit", { limit: e.limit }) }, { status: 429 });
    throw e;
  }

  try {
    const draft = await generateProcurement(body.data, profile, locale);
    return Response.json({ draft: { ...draft, currency: draft.currency ?? body.data.currency }, remaining: reservation.remaining });
  } catch (e) {
    await reservation.refund();
    if (e instanceof ProcurementTooLongError) {
      console.warn("procurement generation:", e.message);
      return Response.json({ error: t("procurement.errors.tooLongGenerate") }, { status: 422 });
    }
    console.error("procurement generation failed", e);
    return Response.json({ error: t("procurement.errors.generateFailed") }, { status: 502 });
  }
}

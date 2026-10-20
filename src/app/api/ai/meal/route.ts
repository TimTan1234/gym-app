import { z } from "zod";
import { db } from "@/lib/db";
import { getUserForApi } from "@/lib/session";
import { AiLimitError, reserveAiCall } from "@/lib/ai/client";
import { analyzeMeal } from "@/lib/ai/meal";
import { todayLocal } from "@/lib/dates";
import { getLocale, getT } from "@/i18n/server";

const MAX_IMAGE_CHARS = 2_800_000; // ~2 MB binary as base64

const BodySchema = z
  .object({
    text: z.string().trim().max(1000).optional(),
    image: z
      .string()
      .max(MAX_IMAGE_CHARS, "imageTooLarge")
      .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, "imageFormat")
      .optional(),
  })
  .refine((b) => b.text || b.image, "describeOrPhoto");

// Validation messages are message keys, translated when the error is returned.
const ERROR_KEYS = ["imageTooLarge", "imageFormat", "describeOrPhoto"] as const;

export async function POST(request: Request) {
  const [user, t, locale] = await Promise.all([getUserForApi(), getT(), getLocale()]);
  if (!user) return Response.json({ error: t("common.unauthorized") }, { status: 401 });

  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    const code = ERROR_KEYS.find((k) => k === body.error.issues[0]?.message);
    return Response.json({ error: t(code ? `nutrition.${code}` : "nutrition.invalidRequest") }, { status: 400 });
  }

  const profile = await db.profile.findUnique({ where: { userId: user.id }, select: { timezone: true } });
  let reservation;
  try {
    reservation = await reserveAiCall(user.id, "MEAL", todayLocal(profile?.timezone ?? "UTC"));
  } catch (e) {
    if (e instanceof AiLimitError) return Response.json({ error: t("common.aiLimit", { limit: e.limit }) }, { status: 429 });
    throw e;
  }

  try {
    const analysis = await analyzeMeal({ text: body.data.text, imageDataUrl: body.data.image, locale });
    if (!analysis.isFood || analysis.items.length === 0) {
      await reservation.refund();
      return Response.json({ error: t("nutrition.notFood") }, { status: 422 });
    }
    return Response.json({ analysis, remaining: reservation.remaining });
  } catch (e) {
    await reservation.refund();
    console.error("meal analysis failed", e);
    return Response.json({ error: t("nutrition.analyseUnavailable") }, { status: 502 });
  }
}

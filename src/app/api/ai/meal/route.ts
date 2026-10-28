import { z } from "zod";
import { db } from "@/lib/db";
import { getUserForApi } from "@/lib/session";
import { AiLimitError, reserveAiCall } from "@/lib/ai/client";
import { analyzeMeal } from "@/lib/ai/meal";
import { MAX_MEAL_PHOTOS } from "@/lib/ai/schemas";
import { todayLocal } from "@/lib/dates";
import { getLocale, getT } from "@/i18n/server";

const MAX_IMAGE_CHARS = 2_800_000; // ~2 MB binary as base64

const ImageSchema = z
  .string()
  .max(MAX_IMAGE_CHARS, "imageTooLarge")
  .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, "imageFormat");

const BodySchema = z
  .object({
    text: z.string().trim().max(1000).optional(),
    images: z.array(ImageSchema).max(MAX_MEAL_PHOTOS, "tooManyPhotos").optional(),
    /** A single photo, as sent before several were allowed. */
    image: ImageSchema.optional(),
  })
  .refine((b) => b.text || b.image || b.images?.length, "describeOrPhoto");

// Validation messages are message keys, translated when the error is returned.
const ERROR_KEYS = ["imageTooLarge", "imageFormat", "describeOrPhoto", "tooManyPhotos"] as const;

export async function POST(request: Request) {
  const [user, t, locale] = await Promise.all([getUserForApi(), getT(), getLocale()]);
  if (!user) return Response.json({ error: t("common.unauthorized") }, { status: 401 });

  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    const code = ERROR_KEYS.find((k) => k === body.error.issues[0]?.message);
    if (code === "tooManyPhotos") return Response.json({ error: t("nutrition.tooManyPhotos", { max: MAX_MEAL_PHOTOS }) }, { status: 400 });
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
    const images = [...(body.data.image ? [body.data.image] : []), ...(body.data.images ?? [])].slice(0, MAX_MEAL_PHOTOS);
    const analysis = await analyzeMeal({ text: body.data.text, imageDataUrls: images, locale });
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

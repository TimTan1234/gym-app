import { z } from "zod";
import { db } from "@/lib/db";
import { getUserForApi } from "@/lib/session";
import { AiLimitError, reserveAiCall } from "@/lib/ai/client";
import { BodyFatRefusal, estimateBodyFat } from "@/lib/ai/bodyfat";
import { ImageSchema } from "@/lib/ai/image-input";
import { MAX_BODY_PHOTOS } from "@/lib/ai/schemas";
import { ageOn, todayLocal } from "@/lib/dates";
import { getLocale, getT } from "@/i18n/server";

// The photos are only passed to the AI: never stored, never logged.
const BodySchema = z.object({
  images: z.array(ImageSchema).min(1, "needPhoto").max(MAX_BODY_PHOTOS, "tooManyPhotos"),
});

const ERROR_KEYS = ["imageTooLarge", "imageFormat", "needPhoto", "tooManyPhotos"] as const;

export async function POST(request: Request) {
  const [user, t, locale] = await Promise.all([getUserForApi(), getT(), getLocale()]);
  if (!user) return Response.json({ error: t("common.unauthorized") }, { status: 401 });

  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    const code = ERROR_KEYS.find((k) => k === body.error.issues[0]?.message) ?? "needPhoto";
    return Response.json({ error: t(`progress.photo.${code}`, { max: MAX_BODY_PHOTOS }) }, { status: 400 });
  }

  // Sex, age, height and the latest weight and waist come from the account, not the request.
  const profile = await db.profile.findUnique({ where: { userId: user.id }, select: { sex: true, birthDate: true, heightCm: true, timezone: true } });
  if (!profile) return Response.json({ error: t("progress.photo.failed") }, { status: 400 });
  const today = todayLocal(profile.timezone);
  const latest = await db.bodyMetric.findFirst({ where: { userId: user.id }, orderBy: { localDate: "desc" }, select: { weightKg: true, waistCm: true } });

  let reservation;
  try {
    reservation = await reserveAiCall(user.id, "BODY", today);
  } catch (e) {
    if (e instanceof AiLimitError) return Response.json({ error: t("common.aiLimit", { limit: e.limit }) }, { status: 429 });
    throw e;
  }

  try {
    const estimate = await estimateBodyFat({
      imageDataUrls: body.data.images,
      sex: profile.sex,
      age: ageOn(profile.birthDate, today),
      heightCm: profile.heightCm,
      weightKg: latest?.weightKg ?? null,
      waistCm: latest?.waistCm ?? null,
      locale,
    });
    if (!estimate.usable) {
      await reservation.refund();
      return Response.json({ error: t(`progress.photo.reason.${estimate.reason ?? "body_not_visible"}`) }, { status: 422 });
    }
    return Response.json({ estimate, remaining: reservation.remaining });
  } catch (e) {
    await reservation.refund();
    // Log the failure, never the request (it holds the photos).
    console.error("body fat estimate failed", e instanceof BodyFatRefusal ? "refused" : e instanceof Error ? e.message : e);
    return Response.json({ error: t("progress.photo.failed") }, { status: e instanceof BodyFatRefusal ? 422 : 502 });
  }
}

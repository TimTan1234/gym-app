import { z } from "zod";
import { db } from "@/lib/db";
import { getUserForApi } from "@/lib/session";
import { AiLimitError, reserveAiCall } from "@/lib/ai/client";
import { identifyExercises } from "@/lib/ai/exercise";
import { ImageSchema } from "@/lib/ai/image-input";
import { todayLocal } from "@/lib/dates";
import { getLocale, getT } from "@/i18n/server";

// The photo is only passed to the AI: never stored, never logged.
const BodySchema = z
  .object({
    text: z.string().trim().max(300).optional(),
    image: ImageSchema.optional(),
  })
  .refine((b) => b.text || b.image, "describeOrPhoto");

const ERROR_KEYS = ["imageTooLarge", "imageFormat", "describeOrPhoto"] as const;

export async function POST(request: Request) {
  const [user, t, locale] = await Promise.all([getUserForApi(), getT(), getLocale()]);
  if (!user) return Response.json({ error: t("common.unauthorized") }, { status: 401 });

  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    const code = ERROR_KEYS.find((k) => k === body.error.issues[0]?.message) ?? "describeOrPhoto";
    return Response.json({ error: t(`train.identify.${code}`) }, { status: 400 });
  }

  const [profile, library] = await Promise.all([
    db.profile.findUnique({ where: { userId: user.id }, select: { timezone: true } }),
    db.exercise.findMany({
      where: { OR: [{ userId: null }, { userId: user.id }] },
      select: { id: true, slug: true, name: true, primaryMuscle: true, equipment: true },
    }),
  ]);

  let reservation;
  try {
    reservation = await reserveAiCall(user.id, "EXERCISE", todayLocal(profile?.timezone ?? "UTC"));
  } catch (e) {
    if (e instanceof AiLimitError) return Response.json({ error: t("common.aiLimit", { limit: e.limit }) }, { status: 429 });
    throw e;
  }

  try {
    const result = await identifyExercises({ imageDataUrl: body.data.image, text: body.data.text, library, locale });
    if (!result.recognized) {
      await reservation.refund();
      return Response.json({ error: t("train.identify.notEquipment") }, { status: 422 });
    }
    return Response.json({ ...result, remaining: reservation.remaining });
  } catch (e) {
    await reservation.refund();
    // Log the failure, never the request (it holds the photo).
    console.error("exercise identification failed", e instanceof Error ? e.message : e);
    return Response.json({ error: t("train.identify.failed") }, { status: 502 });
  }
}

import { z } from "zod";
import { db } from "@/lib/db";
import { getUserForApi } from "@/lib/session";
import { AiLimitError, reserveAiCall } from "@/lib/ai/client";
import { analyzeMeal } from "@/lib/ai/meal";
import { todayLocal } from "@/lib/dates";

const MAX_IMAGE_CHARS = 2_800_000; // ~2 MB binary as base64

const BodySchema = z
  .object({
    text: z.string().trim().max(1000).optional(),
    image: z
      .string()
      .max(MAX_IMAGE_CHARS, "Image is too large")
      .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, "Unsupported image format")
      .optional(),
  })
  .refine((b) => b.text || b.image, "Describe the meal or add a photo");

export async function POST(request: Request) {
  const user = await getUserForApi();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: body.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });

  const profile = await db.profile.findUnique({ where: { userId: user.id }, select: { timezone: true } });
  let reservation;
  try {
    reservation = await reserveAiCall(user.id, "MEAL", todayLocal(profile?.timezone ?? "UTC"));
  } catch (e) {
    if (e instanceof AiLimitError) return Response.json({ error: e.message }, { status: 429 });
    throw e;
  }

  try {
    const analysis = await analyzeMeal({ text: body.data.text, imageDataUrl: body.data.image });
    if (!analysis.isFood || analysis.items.length === 0) {
      await reservation.refund();
      return Response.json({ error: "That doesn't look like food. Try describing the meal." }, { status: 422 });
    }
    return Response.json({ analysis, remaining: reservation.remaining });
  } catch (e) {
    await reservation.refund();
    console.error("meal analysis failed", e);
    return Response.json({ error: "Couldn't analyse that meal right now. Please try again." }, { status: 502 });
  }
}

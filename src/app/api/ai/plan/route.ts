import { db } from "@/lib/db";
import { getUserForApi } from "@/lib/session";
import { AiLimitError, reserveAiCall } from "@/lib/ai/client";
import { generatePlan } from "@/lib/ai/plan";
import { PlanRequestSchema } from "@/lib/ai/schemas";
import { todayLocal } from "@/lib/dates";

export async function POST(request: Request) {
  const user = await getUserForApi();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = PlanRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: body.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });

  const profile = await db.profile.findUnique({ where: { userId: user.id }, select: { timezone: true } });
  let reservation;
  try {
    reservation = await reserveAiCall(user.id, "PLAN", todayLocal(profile?.timezone ?? "UTC"));
  } catch (e) {
    if (e instanceof AiLimitError) return Response.json({ error: e.message }, { status: 429 });
    throw e;
  }

  try {
    const library = await db.exercise.findMany({
      where: { OR: [{ userId: null }, { userId: user.id }], category: { not: "CARDIO" } },
      select: { id: true, slug: true, name: true, primaryMuscle: true, equipment: true },
    });
    const draft = await generatePlan(body.data, library);
    return Response.json({ draft, remaining: reservation.remaining });
  } catch (e) {
    await reservation.refund();
    console.error("plan generation failed", e);
    const message = e instanceof Error && e.message.startsWith("Not enough exercises") ? e.message : "Couldn't generate a plan right now. Please try again.";
    return Response.json({ error: message }, { status: 502 });
  }
}

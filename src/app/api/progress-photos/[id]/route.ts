import { getUserForApi } from "@/lib/session";
import { db } from "@/lib/db";
import { PHOTO_HEADERS } from "@/lib/progress-photos";
import { getT } from "@/i18n/server";

/** One of the signed-in user's own progress photos. */
export async function GET(_req: Request, ctx: RouteContext<"/api/progress-photos/[id]">) {
  const [user, t, { id }] = await Promise.all([getUserForApi(), getT(), ctx.params]);
  if (!user) return Response.json({ error: t("common.unauthorized") }, { status: 401 });
  const photo = await db.progressPhoto.findFirst({ where: { id, userId: user.id }, select: { bytes: true } });
  if (!photo) return Response.json({ error: t("common.notFound") }, { status: 404 });
  return new Response(photo.bytes, { headers: PHOTO_HEADERS });
}

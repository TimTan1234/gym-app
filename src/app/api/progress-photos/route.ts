import { getUserForApi } from "@/lib/session";
import { db } from "@/lib/db";
import { isLocalDate, todayLocal } from "@/lib/dates";
import { PHOTO_MAX_BYTES, isJpeg } from "@/lib/progress-photos";
import { getT } from "@/i18n/server";

/** Keeps a progress photo for a date (multipart: `photo`, `date`), replacing that date's photo. */
export async function POST(req: Request) {
  const [user, t] = await Promise.all([getUserForApi(), getT()]);
  if (!user) return Response.json({ error: t("common.unauthorized") }, { status: 401 });
  const profile = await db.profile.findUnique({ where: { userId: user.id }, select: { timezone: true } });
  if (!profile) return Response.json({ error: t("common.unauthorized") }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const photo = form?.get("photo");
  const date = String(form?.get("date") ?? "");
  if (!isLocalDate(date) || date > todayLocal(profile.timezone)) return Response.json({ error: t("progress.photos.invalidDate") }, { status: 400 });
  if (!(photo instanceof Blob)) return Response.json({ error: t("progress.photos.unreadable") }, { status: 400 });
  if (photo.size > PHOTO_MAX_BYTES) return Response.json({ error: t("progress.photos.tooLarge") }, { status: 413 });
  const bytes = new Uint8Array(await photo.arrayBuffer());
  if (!isJpeg(bytes)) return Response.json({ error: t("progress.photos.unreadable") }, { status: 400 });

  const saved = await db.progressPhoto.upsert({
    where: { userId_localDate: { userId: user.id, localDate: date } },
    create: { userId: user.id, localDate: date, bytes },
    update: { bytes, createdAt: new Date() },
    select: { id: true },
  });
  return Response.json({ id: saved.id });
}

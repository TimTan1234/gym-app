import { Suspense } from "react";
import { requireProfile } from "@/lib/session";
import { db } from "@/lib/db";
import { formatLocalDate, todayLocal } from "@/lib/dates";
import { ProgressPhotos, type ShownPhoto } from "@/components/progress/ProgressPhotos";
import { BackLink, PageHeader, PageSkeleton } from "@/components/ui";
import { INTL_LOCALE } from "@/i18n/config";
import { getT } from "@/i18n/server";

export const metadata = { title: "Progress photos" };

async function Photos() {
  const [{ user, profile }, t] = await Promise.all([requireProfile(), getT()]);
  const rows = await db.progressPhoto.findMany({ where: { userId: user.id }, orderBy: { localDate: "asc" }, select: { id: true, localDate: true, createdAt: true } });
  const weights = await db.bodyMetric.findMany({ where: { userId: user.id, localDate: { in: rows.map((r) => r.localDate) } }, select: { localDate: true, weightKg: true } });
  const weightOn = new Map(weights.map((w) => [w.localDate, w.weightKg]));
  const photos: ShownPhoto[] = rows.map((r) => ({
    id: r.id,
    date: r.localDate,
    label: formatLocalDate(r.localDate, { weekday: undefined, year: "numeric" }, INTL_LOCALE[t.locale]),
    weightKg: weightOn.get(r.localDate) ?? null,
    // A replaced photo keeps its id; the version makes the browser load the new one.
    src: `/api/progress-photos/${r.id}?v=${r.createdAt.getTime()}`,
  }));
  return (
    <>
      <BackLink href="/progress" label={t("progress.title")} />
      <PageHeader title={t("progress.photos.title")} subtitle={t("progress.photos.privacy")} />
      <ProgressPhotos photos={photos} today={todayLocal(profile.timezone)} units={profile.unitSystem} />
    </>
  );
}

export default function PhotosPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Photos />
    </Suspense>
  );
}

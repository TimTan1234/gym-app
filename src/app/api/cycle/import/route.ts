import { db } from "@/lib/db";
import { getUserForApi } from "@/lib/session";
import { LunaImportError, MAX_IMPORT_BYTES, parseLunaFile } from "@/lib/cycle/luna-import";
import { learnedPeriodLength, periodEnd } from "@/lib/cycle/predict";
import { getT } from "@/i18n/server";

export interface ImportSummary {
  periods: number;
  days: number;
  /** Already in GymPal: a period overlapping one logged here, or a day logged here. Kept as it is. */
  existing: number;
  invalid: number;
}

// Multipart: file (a Luna .json backup or .csv export), apply ("1" saves, otherwise a preview).
// The file is read in memory and never stored. Existing GymPal records always win.
export async function POST(request: Request) {
  const [user, t] = await Promise.all([getUserForApi(), getT()]);
  if (!user) return Response.json({ error: t("common.unauthorized") }, { status: 401 });
  const profile = await db.profile.findUnique({ where: { userId: user.id }, select: { periodLength: true, customSymptoms: true } });
  if (!profile) return Response.json({ error: t("common.unauthorized") }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: t("cycle.import.errors.invalidRequest") }, { status: 400 });
  if (file.size > MAX_IMPORT_BYTES) return Response.json({ error: t("cycle.import.errors.tooLarge") }, { status: 400 });

  let parsed;
  try {
    parsed = parseLunaFile(file.name, await file.text());
  } catch (e) {
    if (e instanceof LunaImportError) return Response.json({ error: t(`cycle.import.errors.${e.key}`) }, { status: 400 });
    throw e;
  }

  const [periods, days] = await Promise.all([
    db.period.findMany({ where: { userId: user.id }, select: { startDate: true, endDate: true } }),
    db.cycleDay.findMany({ where: { userId: user.id }, select: { localDate: true } }),
  ]);
  const len = learnedPeriodLength(periods, profile.periodLength);
  const overlaps = (a: { startDate: string; endDate: string | null }, b: typeof a) => a.startDate <= periodEnd(b, len) && b.startDate <= periodEnd(a, len);
  const loggedDays = new Set(days.map((d) => d.localDate));
  const newPeriods = parsed.periods.filter((p) => !periods.some((e) => overlaps(p, e)));
  const newDays = parsed.days.filter((d) => !loggedDays.has(d.localDate));
  const summary: ImportSummary = {
    periods: newPeriods.length,
    days: newDays.length,
    existing: parsed.periods.length - newPeriods.length + parsed.days.length - newDays.length,
    invalid: parsed.invalid,
  };
  if (form?.get("apply") !== "1") return Response.json(summary);

  const custom = parsed.customSymptoms.filter((s) => !profile.customSymptoms.includes(s));
  await db.$transaction([
    db.period.createMany({ data: newPeriods.map((p) => ({ userId: user.id, ...p })), skipDuplicates: true }),
    db.cycleDay.createMany({ data: newDays.map((d) => ({ userId: user.id, ...d })), skipDuplicates: true }),
    db.profile.update({ where: { userId: user.id }, data: { cycleTracking: true, customSymptoms: [...profile.customSymptoms, ...custom] } }),
  ]);
  return Response.json(summary);
}

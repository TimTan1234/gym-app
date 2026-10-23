import { db } from "@/lib/db";
import { getUserForApi } from "@/lib/session";
import { AiLimitError, reserveAiCall } from "@/lib/ai/client";
import { PROCUREMENT_PROFILE_SELECT, ProcurementTooLongError, parseProcurement } from "@/lib/ai/procurement";
import { ExtractError, MAX_TEXT_CHARS, extractSource } from "@/lib/procurement/extract";
import { todayLocal } from "@/lib/dates";
import { getLocale, getT } from "@/i18n/server";

/** A whole number from a form field, clamped to [min, max]; `fallback` when missing or invalid. */
function intField(value: FormDataEntryValue | null, min: number, max: number, fallback: number) {
  const n = typeof value === "string" ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

// Multipart: files (up to 4 photos, .md, .txt, .docx or .pdf), text, days, people.
// Files are read in memory and never stored.
export async function POST(request: Request) {
  const [user, t, locale] = await Promise.all([getUserForApi(), getT(), getLocale()]);
  if (!user) return Response.json({ error: t("common.unauthorized") }, { status: 401 });

  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ error: t("procurement.errors.invalidRequest") }, { status: 400 });
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const text = form.get("text");
  if (typeof text === "string" && text.length > MAX_TEXT_CHARS) {
    return Response.json({ error: t("procurement.errors.textTooLong") }, { status: 400 });
  }
  const days = intField(form.get("days"), 1, 31, 7);
  const people = intField(form.get("people"), 1, 12, 1);

  let extracted;
  try {
    extracted = await extractSource(files, typeof text === "string" ? text : undefined);
  } catch (e) {
    if (e instanceof ExtractError) return Response.json({ error: t(`procurement.errors.${e.key}`) }, { status: 400 });
    throw e;
  }

  const profile = await db.profile.findUnique({ where: { userId: user.id }, select: PROCUREMENT_PROFILE_SELECT });
  if (!profile) return Response.json({ error: t("common.unauthorized") }, { status: 401 });
  let reservation;
  try {
    reservation = await reserveAiCall(user.id, "PROCUREMENT", todayLocal(profile.timezone));
  } catch (e) {
    if (e instanceof AiLimitError) return Response.json({ error: t("common.aiLimit", { limit: e.limit }) }, { status: 429 });
    throw e;
  }

  try {
    const draft = await parseProcurement({ text: extracted.text, images: extracted.images, days, people, profile, locale });
    if (!draft.isPlan || (draft.items.length === 0 && draft.meals.length === 0)) {
      console.warn("procurement import: not a plan", { isPlan: draft.isPlan, items: draft.items.length, notes: draft.notes });
      await reservation.refund();
      return Response.json({ error: t("procurement.errors.notAPlan") }, { status: 422 });
    }
    return Response.json({ draft, source: extracted.source, remaining: reservation.remaining });
  } catch (e) {
    await reservation.refund();
    if (e instanceof ProcurementTooLongError) {
      console.warn("procurement import:", e.message);
      return Response.json({ error: t("procurement.errors.tooLong") }, { status: 422 });
    }
    console.error("procurement import failed", e);
    return Response.json({ error: t("procurement.errors.readFailed") }, { status: 502 });
  }
}

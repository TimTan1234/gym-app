import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { getUserForApi } from "@/lib/session";
import { db } from "@/lib/db";
import { getWeeklyRecap } from "@/lib/queries";
import { RECAP_SIZE, RecapCard, recapContent } from "@/components/progress/RecapCard";
import { getT } from "@/i18n/server";

// Subsets made by scripts/recap-fonts.ts; next.config.ts traces them into the standalone build.
const FONT_DIR = join(process.cwd(), "src/assets/recap");
const FONT_FILES = [
  { name: "Inter", file: "inter-400.ttf", weight: 400 },
  { name: "Inter", file: "inter-600.ttf", weight: 600 },
  { name: "Source Serif 4", file: "source-serif-4-400.ttf", weight: 400 },
  { name: "Noto Sans SC", file: "noto-sans-sc-400.ttf", weight: 400 },
  { name: "Noto Sans SC", file: "noto-sans-sc-600.ttf", weight: 600 },
] as const;

let fonts: Promise<{ name: string; data: Buffer; weight: 400 | 600; style: "normal" }[]> | null = null;
const loadFonts = () =>
  (fonts ??= Promise.all(FONT_FILES.map(async (f) => ({ name: f.name, data: await readFile(join(FONT_DIR, f.file)), weight: f.weight, style: "normal" as const }))));

/** The signed-in user's last full week as a PNG card, to share. */
export async function GET() {
  const [user, t] = await Promise.all([getUserForApi(), getT()]);
  if (!user) return Response.json({ error: t("common.unauthorized") }, { status: 401 });
  const profile = await db.profile.findUnique({ where: { userId: user.id }, select: { timezone: true, targetKcal: true, unitSystem: true } });
  const recap = profile && (await getWeeklyRecap(user.id, profile.timezone, profile.targetKcal));
  if (!profile || !recap) return Response.json({ error: t("progress.recap.empty") }, { status: 404 });
  return new ImageResponse(<RecapCard content={recapContent(recap, t, profile.unitSystem)} />, {
    ...RECAP_SIZE,
    fonts: await loadFonts(),
    // Personal numbers: never kept by a shared cache.
    headers: { "Cache-Control": "private, no-store" },
  });
}

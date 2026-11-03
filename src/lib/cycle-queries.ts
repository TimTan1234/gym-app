import "server-only";
import { db } from "@/lib/db";
import { cycleToday, predictCycle } from "@/lib/cycle/predict";
import { readSymptoms } from "@/lib/cycle/symptoms";

export interface CycleProfile {
  sex: "MALE" | "FEMALE";
  cycleTracking: boolean;
  cycleLength: number;
  periodLength: number;
}

/** Cycle tracking shows only for women who turned it on; the data stays if either changes. */
export function cycleEnabled(profile: Pick<CycleProfile, "sex" | "cycleTracking">) {
  return profile.sex === "FEMALE" && profile.cycleTracking;
}

/** All logged periods (oldest first), the prediction, and where today sits in the cycle. */
export async function getCycleState(userId: string, profile: CycleProfile, today: string) {
  const periods = await db.period.findMany({ where: { userId }, orderBy: { startDate: "asc" }, select: { id: true, startDate: true, endDate: true } });
  const prediction = predictCycle(periods, profile);
  return { periods, prediction, now: prediction ? cycleToday(prediction, periods, today) : null };
}

/** Logged days from `from` to `to` (inclusive), oldest first, with symptoms read from JSON. */
export async function getCycleDays(userId: string, from: string, to: string) {
  const days = await db.cycleDay.findMany({ where: { userId, localDate: { gte: from, lte: to } }, orderBy: { localDate: "asc" } });
  return days.map((d) => ({ ...d, symptoms: readSymptoms(d.symptoms) }));
}

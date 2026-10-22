"use server";

import { z } from "zod";
import { refresh } from "next/cache";
import { db } from "@/lib/db";
import { requireProfile, requireUser } from "@/lib/session";
import { getCheckin } from "@/lib/queries";
import { KCAL_FLOOR, computeTargets } from "@/lib/nutrition/targets";
import { MIN_DAILY_CARBS_G } from "@/lib/nutrition/diabetes";
import { DEFAULT_GLUCOSE_TARGETS } from "@/lib/glucose";
import { ageOn, isLocalDate, isValidTimezone, todayLocal } from "@/lib/dates";
import { getT } from "@/i18n/server";
import type { MessageKey } from "@/i18n/translate";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** A validation failure in the user's language: a named message, "Check the <field>.", or a generic fallback. */
async function invalidInput(error: z.ZodError): Promise<ActionResult> {
  const t = await getT();
  const issue = error.issues[0];
  if (issue?.message === "invalidDate" || issue?.message === "unknownTimezone") {
    return { ok: false, error: t(`settings.errors.${issue.message}`) };
  }
  const key = `settings.fields.${String(issue?.path[0])}`;
  const field = t(key as MessageKey);
  return { ok: false, error: field === key ? t("settings.errors.invalid") : t("settings.errors.invalidField", { field }) };
}

const ProfileSchema = z.object({
  name: z.string().trim().min(1).max(60),
  sex: z.enum(["MALE", "FEMALE"]),
  birthDate: z.string().refine(isLocalDate, "invalidDate"),
  heightCm: z.number().min(100).max(250),
  weightKg: z.number().min(30).max(350),
  activityLevel: z.enum(["SEDENTARY", "LIGHT", "MODERATE", "ACTIVE", "VERY_ACTIVE"]),
  goal: z.enum(["CUT", "MAINTAIN", "BULK"]),
  rateKgPerWeek: z.number().min(0).max(1),
  timezone: z.string().refine(isValidTimezone, "unknownTimezone"),
  unitSystem: z.enum(["METRIC", "IMPERIAL"]),
  experience: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]),
  equipment: z.array(z.string().max(40)).max(20),
});
export type ProfileInput = z.infer<typeof ProfileSchema>;

function targetsFor(
  p: Omit<ProfileInput, "name" | "timezone" | "unitSystem" | "experience" | "equipment"> & { diabetes: boolean },
  today: string,
) {
  const age = ageOn(new Date(`${p.birthDate}T00:00:00Z`), today);
  const t = computeTargets({ ...p, age });
  return { targetKcal: t.kcal, targetProteinG: t.proteinG, targetCarbsG: t.carbsG, targetFatG: t.fatG };
}

export async function saveProfile(input: ProfileInput): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = ProfileSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);
  const p = parsed.data;
  const today = todayLocal(p.timezone);

  const [existing, latest] = await Promise.all([
    db.profile.findUnique({ where: { userId: user.id } }),
    db.bodyMetric.findFirst({ where: { userId: user.id }, orderBy: { localDate: "desc" } }),
  ]);
  const keepManual = existing?.targetsManual ?? false;
  // Only record a weigh-in when the weight actually changed; saving other
  // settings (or a kg↔lb round trip) must not create a fake entry for today.
  const weightChanged = !latest || Math.abs(latest.weightKg - p.weightKg) > 0.05;
  const weightKg = weightChanged ? p.weightKg : latest.weightKg;
  const data = {
    sex: p.sex,
    birthDate: new Date(`${p.birthDate}T00:00:00Z`),
    heightCm: p.heightCm,
    activityLevel: p.activityLevel,
    goal: p.goal,
    rateKgPerWeek: p.rateKgPerWeek,
    timezone: p.timezone,
    unitSystem: p.unitSystem,
    experience: p.experience,
    equipment: p.equipment,
    ...(keepManual && existing
      ? {
          targetKcal: existing.targetKcal,
          targetProteinG: existing.targetProteinG,
          targetCarbsG: existing.targetCarbsG,
          targetFatG: existing.targetFatG,
        }
      : targetsFor({ ...p, weightKg, diabetes: existing?.diabetesMode ?? false }, today)),
  };
  // A goal or activity change that moves calories restarts the weekly check-in clock;
  // small drifts from weigh-ins don't.
  const targetsSetOn =
    existing && Math.abs(data.targetKcal - existing.targetKcal) >= 100 ? today : (existing?.targetsSetOn ?? null);

  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { name: p.name } }),
    db.profile.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: { ...data, targetsSetOn } }),
    ...(weightChanged
      ? [
          db.bodyMetric.upsert({
            where: { userId_localDate: { userId: user.id, localDate: today } },
            create: { userId: user.id, localDate: today, weightKg: p.weightKg },
            update: { weightKg: p.weightKg },
          }),
        ]
      : []),
  ]);
  refresh();
  return { ok: true };
}

/** Recompute automatic targets from the latest weight (no-op if manual). */
async function recomputeTargets(userId: string) {
  const profile = await db.profile.findUnique({ where: { userId } });
  if (!profile || profile.targetsManual) return;
  const latest = await db.bodyMetric.findFirst({ where: { userId }, orderBy: { localDate: "desc" } });
  if (!latest) return;
  const today = todayLocal(profile.timezone);
  const targets = targetsFor(
    {
      sex: profile.sex,
      birthDate: profile.birthDate.toISOString().slice(0, 10),
      heightCm: profile.heightCm,
      weightKg: latest.weightKg,
      activityLevel: profile.activityLevel,
      goal: profile.goal,
      rateKgPerWeek: profile.rateKgPerWeek,
      diabetes: profile.diabetesMode,
    },
    today,
  );
  await db.profile.update({ where: { userId }, data: targets });
}

const MetricSchema = z.object({
  localDate: z.string().refine(isLocalDate, "invalidDate"),
  weightKg: z.number().min(30).max(350),
  bodyFatPct: z.number().min(2).max(70).nullable(),
  waistCm: z.number().min(40).max(250).nullable(),
});

export async function logBodyMetric(input: z.infer<typeof MetricSchema>): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = MetricSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);
  const { localDate, ...values } = parsed.data;
  await db.bodyMetric.upsert({
    where: { userId_localDate: { userId: user.id, localDate } },
    create: { userId: user.id, localDate, ...values },
    update: values,
  });
  await recomputeTargets(user.id);
  refresh();
  return { ok: true };
}

export async function deleteBodyMetric(id: string): Promise<ActionResult> {
  const user = await requireUser();
  await db.bodyMetric.deleteMany({ where: { id, userId: user.id } });
  await recomputeTargets(user.id);
  refresh();
  return { ok: true };
}

const TargetsSchema = z.object({
  manual: z.boolean(),
  targetKcal: z.number().int().min(1000).max(8000),
  targetProteinG: z.number().int().min(0).max(500),
  targetCarbsG: z.number().int().min(0).max(1000),
  targetFatG: z.number().int().min(0).max(400),
});

export async function setTargets(input: z.infer<typeof TargetsSchema>): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = TargetsSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);
  const { manual, ...targets } = parsed.data;
  const profile = await db.profile.findUnique({ where: { userId: user.id }, select: { sex: true, timezone: true, diabetesMode: true } });
  if (!profile) return { ok: false, error: (await getT())("settings.errors.noProfile") };
  // Lets the weekly check-in wait for a week of data on the new targets.
  const targetsSetOn = todayLocal(profile.timezone);
  if (manual) {
    const floor = KCAL_FLOOR[profile.sex];
    if (targets.targetKcal < floor) return { ok: false, error: (await getT())("settings.errors.kcalFloor", { floor }) };
    // The CPG minimum; this also covers targets proposed by the coach or a check-in.
    if (profile.diabetesMode && targets.targetCarbsG < MIN_DAILY_CARBS_G) {
      return { ok: false, error: (await getT())("settings.errors.carbFloor", { min: MIN_DAILY_CARBS_G }) };
    }
    await db.profile.update({ where: { userId: user.id }, data: { ...targets, targetsManual: true, targetsSetOn } });
  } else {
    await db.profile.update({ where: { userId: user.id }, data: { targetsManual: false, targetsSetOn } });
    await recomputeTargets(user.id);
  }
  refresh();
  return { ok: true };
}

/**
 * Apply the weekly check-in's suggested targets. The suggestion is recomputed
 * here from the user's data, never taken from the client.
 */
export async function applyCheckin(): Promise<ActionResult> {
  const { user, profile } = await requireProfile();
  const checkin = await getCheckin(user.id, profile);
  if (checkin.status !== "adjust" || !checkin.suggested) return { ok: false, error: (await getT())("settings.errors.noChange") };
  const s = checkin.suggested;
  return setTargets({ manual: true, targetKcal: s.kcal, targetProteinG: s.proteinG, targetCarbsG: s.carbsG, targetFatG: s.fatG });
}

const DiabetesSchema = z
  .object({
    enabled: z.boolean(),
    type: z.enum(["PREDIABETES", "TYPE2"]),
    hypoRiskMeds: z.boolean(),
    unit: z.enum(["MMOL_L", "MG_DL"]),
    // mmol/L; the client converts from mg/dL.
    fastingMin: z.number().min(3).max(10),
    fastingMax: z.number().min(4).max(15),
    postMealMax: z.number().min(5).max(20),
  })
  .refine((d) => d.fastingMin < d.fastingMax && d.fastingMax <= d.postMealMax, { message: "glucoseRange", path: ["fastingMax"] });

export type DiabetesSettingsInput = z.infer<typeof DiabetesSchema>;

/**
 * Turn diabetes mode on or off and save its settings. Automatic targets are
 * recomputed so the carb cap applies (or is lifted) straight away.
 */
export async function saveDiabetesSettings(input: DiabetesSettingsInput): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = DiabetesSchema.safeParse(input);
  if (!parsed.success) {
    if (parsed.error.issues[0]?.message === "glucoseRange") return { ok: false, error: (await getT())("settings.errors.glucoseRange") };
    return invalidInput(parsed.error);
  }
  const d = parsed.data;
  await db.profile.update({
    where: { userId: user.id },
    data: {
      diabetesMode: d.enabled,
      diabetesType: d.type,
      hypoRiskMeds: d.hypoRiskMeds,
      glucoseUnit: d.unit,
      glucoseFastingMin: d.fastingMin,
      glucoseFastingMax: d.fastingMax,
      glucosePostMealMax: d.postMealMax,
    },
  });
  await recomputeTargets(user.id);
  refresh();
  return { ok: true };
}

/** Back to the CPG Table 3-5 targets. */
export async function resetGlucoseTargets(): Promise<ActionResult> {
  const user = await requireUser();
  const t = DEFAULT_GLUCOSE_TARGETS;
  await db.profile.update({
    where: { userId: user.id },
    data: { glucoseFastingMin: t.fastingMin, glucoseFastingMax: t.fastingMax, glucosePostMealMax: t.postMealMax },
  });
  refresh();
  return { ok: true };
}

import Link from "next/link";
import { Droplet } from "lucide-react";
import { db } from "@/lib/db";
import { toLocalTime } from "@/lib/dates";
import { classifyReading } from "@/lib/glucose";
import { Section, buttonClass } from "@/components/ui";
import { AfterMealPrompt, GlucoseValue, SafetyCard, StatusTag } from "./GlucoseBits";
import { mealDueForCheck } from "@/lib/glucose-queries";
import { getT } from "@/i18n/server";

interface GlucoseProfile {
  timezone: string;
  glucoseUnit: "MMOL_L" | "MG_DL";
  glucoseFastingMin: number;
  glucoseFastingMax: number;
  glucosePostMealMax: number;
}

/** Today's latest glucose reading and a way to log the next, for diabetes mode. */
export async function GlucoseToday({ userId, today, profile }: { userId: string; today: string; profile: GlucoseProfile }) {
  const [latest, due, t] = await Promise.all([
    db.glucoseReading.findFirst({
      where: { userId, localDate: today },
      orderBy: [{ measuredAt: "desc" }, { createdAt: "desc" }],
      include: { meal: { select: { eatenAt: true } } },
    }),
    mealDueForCheck(userId, today, profile),
    getT(),
  ]);
  const status = latest
    ? classifyReading(
        {
          mmol: latest.mmol,
          context: latest.context,
          minutesAfterMeal: latest.meal ? Math.round((latest.measuredAt.getTime() - latest.meal.eatenAt.getTime()) / 60000) : null,
        },
        { fastingMin: profile.glucoseFastingMin, fastingMax: profile.glucoseFastingMax, postMealMax: profile.glucosePostMealMax },
      )
    : null;

  return (
    <Section
      title={t("glucose.title")}
      action={
        <Link href="/glucose" className={buttonClass("secondary", "sm")}>
          <Droplet className="size-4" /> {t("glucose.log.title")}
        </Link>
      }
    >
      {latest && status ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-steel">
                {t("glucose.readingAt", { context: t(`glucose.context.${latest.context}`), time: toLocalTime(latest.measuredAt, profile.timezone) })}
              </p>
              <StatusTag status={status} />
            </div>
            <GlucoseValue mmol={latest.mmol} unit={profile.glucoseUnit} className="score text-[32px]" />
          </div>
          <SafetyCard status={status} unit={profile.glucoseUnit} />
        </div>
      ) : (
        <p className="text-sm text-steel">{t("glucose.noneToday")}</p>
      )}
      {due && <AfterMealPrompt meal={due} />}
    </Section>
  );
}

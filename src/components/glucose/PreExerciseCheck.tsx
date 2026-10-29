import Link from "next/link";
import { AlertTriangle, Droplet } from "lucide-react";
import { db } from "@/lib/db";
import { HYPO_MMOL, preExerciseAdvice, toDisplay, unitLabel, type GlucoseUnit } from "@/lib/glucose";
import { buttonClass, cn } from "@/components/ui";
import { getT } from "@/i18n/server";

/** Rendered per request, so "now" is the time of this request. */
const minutesSince = (date: Date) => Math.round((Date.now() - date.getTime()) / 60000);

/**
 * Before training in diabetes mode (CPG T2DM Appendix 5): check glucose if the
 * user's medicine can cause lows, eat first under 5.6 mmol/L, and hold off on
 * a low or very high reading.
 */
export async function PreExerciseCheck({
  userId,
  hypoRiskMeds,
  unit,
  showOk = true,
}: {
  userId: string;
  hypoRiskMeds: boolean;
  unit: GlucoseUnit;
  /** Show the all-clear line; off where the latest reading is already on screen. */
  showOk?: boolean;
}) {
  const [last, t] = await Promise.all([db.glucoseReading.findFirst({ where: { userId }, orderBy: [{ measuredAt: "desc" }, { createdAt: "desc" }] }), getT()]);
  const minutesAgo = last ? minutesSince(last.measuredAt) : 0;
  const advice = preExerciseAdvice(last ? { mmol: last.mmol, minutesAgo } : null, hypoRiskMeds);
  if (!advice) return null;

  const vars = { value: last ? toDisplay(last.mmol, unit) : "", unit: unitLabel(unit), low: toDisplay(HYPO_MMOL, unit), minutes: minutesAgo };
  if (advice === "ok") {
    if (!showOk) return null;
    return (
      <p className="flex items-center gap-2 text-sm text-steel" data-testid="pre-exercise">
        <Droplet className="size-4" aria-hidden /> {t("glucose.exercise.ok", vars)}
      </p>
    );
  }
  const urgent = advice === "low" || advice === "veryHigh";
  return (
    <div
      role={urgent ? "alert" : undefined}
      className={cn("flex flex-wrap items-center gap-3 rounded-field border bg-paper px-3 py-2.5 text-sm", urgent ? "border-2 border-alert" : "border-line")}
      data-testid="pre-exercise"
    >
      {urgent ? <AlertTriangle className="size-5 shrink-0 text-alert" aria-hidden /> : <Droplet className="size-4 shrink-0 text-iron" aria-hidden />}
      <p className={cn("min-w-0 flex-1", urgent && "font-semibold")}>{t(`glucose.exercise.${advice}`, vars)}</p>
      <Link href="/glucose?context=BEFORE_EXERCISE" className={buttonClass("secondary", "sm")}>
        {t("glucose.exercise.logNow")}
      </Link>
    </div>
  );
}

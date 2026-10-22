import { Suspense } from "react";
import Link from "next/link";
import { CalendarCheck, ChevronRight, Plus, Settings, Sparkles, Trophy } from "lucide-react";
import { requireProfile } from "@/lib/session";
import { db } from "@/lib/db";
import { getActiveWorkout, getCheckin, getDayNutrition, getLatestWeight, getNextPlanDay } from "@/lib/queries";
import { formatLocalDate, todayLocal } from "@/lib/dates";
import { formatWeight } from "@/lib/units";
import { MacroSummary } from "@/components/nutrition/MacroSummary";
import { WeightQuickLog } from "@/components/body/WeightQuickLog";
import { StartWorkoutButton } from "@/components/train/StartWorkoutButton";
import { GlucoseToday } from "@/components/glucose/GlucoseToday";
import { PreExerciseCheck } from "@/components/glucose/PreExerciseCheck";
import { PageSkeleton, Section, buttonClass } from "@/components/ui";
import { getT } from "@/i18n/server";
import { INTL_LOCALE } from "@/i18n/config";
import { exerciseName } from "@/i18n/labels";
import type { MessageKey } from "@/i18n/translate";

export const metadata = { title: "Today" };

function greetingKey(hour: number): MessageKey {
  if (hour < 12) return "today.greetingMorning";
  if (hour < 18) return "today.greetingAfternoon";
  return "today.greetingEvening";
}

async function Today() {
  const { user, profile } = await requireProfile();
  const now = new Date();
  const today = todayLocal(profile.timezone, now);
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: profile.timezone, hour: "numeric", hourCycle: "h23" }).format(now));

  const [{ totals }, latestWeight, next, active, recentPRs, checkin, t] = await Promise.all([
    getDayNutrition(user.id, today),
    getLatestWeight(user.id),
    getNextPlanDay(user.id),
    getActiveWorkout(user.id),
    db.personalRecord.findMany({
      where: { userId: user.id, type: "EST_1RM" },
      orderBy: { achievedAt: "desc" },
      take: 20,
      include: { exercise: { select: { name: true, slug: true } } },
    }),
    getCheckin(user.id, profile),
    getT(),
  ]);
  const intl = INTL_LOCALE[t.locale];

  // Each set that beats the last best is its own record row; show only the latest per exercise.
  const seenExercises = new Set<string>();
  const latestPRs = recentPRs.filter((pr) => !seenExercises.has(pr.exerciseId) && seenExercises.add(pr.exerciseId)).slice(0, 3);

  const proteinLeft = Math.max(0, Math.round(profile.targetProteinG - totals.proteinG));

  return (
    <div className="space-y-7">
      <header className="flex items-start justify-between">
        <div>
          <p className="text-sm text-steel">{formatLocalDate(today, { weekday: "long", month: "long" }, intl)}</p>
          <h1 className="display mt-0.5 text-[28px]">{t(greetingKey(hour), { name: user.name.split(" ")[0] })}</h1>
        </div>
        <Link href="/settings" aria-label={t("today.settings")} className={buttonClass("ghost", "sm", "end")}>
          <Settings className="size-5" />
        </Link>
      </header>

      <Link href="/nutrition" aria-label={t("today.openNutrition")} className="block rounded-[14px] focus-visible:outline-offset-4">
        <MacroSummary totals={totals} targets={profile} compact />
      </Link>

      <div className="grid grid-cols-2 gap-2">
        <Link href="/nutrition/log" className={buttonClass("primary", "lg")}>
          <Plus className="size-5" /> {t("today.logMeal")}
        </Link>
        <Link href={`/coach?q=${encodeURIComponent(t("today.mealIdeasPrompt", { protein: proteinLeft }))}`} className={buttonClass("secondary", "lg")}>
          <Sparkles className="size-5" /> {t("today.mealIdeas")}
        </Link>
      </div>

      {profile.diabetesMode && <GlucoseToday userId={user.id} today={today} profile={profile} />}

      {checkin.status === "adjust" && checkin.suggested && (
        <Link href="/progress" className="flex items-center gap-3 border-y border-line py-3 text-sm hover:bg-wash">
          <CalendarCheck className="size-5 shrink-0 text-steel" aria-hidden />
          <span className="flex-1">
            <span className="font-semibold">{t("today.checkinReady")}</span>{" "}
            <span className="text-steel">{t("today.checkinSuggests", { kcal: checkin.suggested.kcal.toLocaleString("en-US") })}</span>
          </span>
          <ChevronRight className="size-4 text-steel" aria-hidden />
        </Link>
      )}

      {profile.diabetesMode && !active && <PreExerciseCheck userId={user.id} hypoRiskMeds={profile.hypoRiskMeds} unit={profile.glucoseUnit} showOk={false} />}

      {/* The one inverted panel: the next thing to do in the gym. */}
      <section className="rounded-[14px] bg-panel p-5 text-panel-fg">
        {active ? (
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm opacity-70">{t("today.workoutInProgress")}</p>
              <p className="display text-[24px]">{t("today.pickUp")}</p>
            </div>
            <Link href={`/train/workout/${active.id}`} className={buttonClass("inverse")}>{t("today.resume")}</Link>
          </div>
        ) : next ? (
          <div className="space-y-4">
            <div>
              <p className="text-sm opacity-70">{t("today.nextSession", { plan: next.plan.name })}</p>
              <p className="score mt-1 text-[44px]">{next.day.name}</p>
              <p className="mt-2 text-sm opacity-80">{next.day.exercises.map((e) => exerciseName(t, e.exercise)).join(t("progress.checkin.listSeparator"))}</p>
            </div>
            <StartWorkoutButton planDayId={next.day.id} label={t("today.startDay", { day: next.day.name })} variant="inverse" />
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="display text-[24px]">{t("today.noPlan")}</p>
              <p className="mt-1 text-sm opacity-70">{t("today.noPlanBody")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/train/plans/new" className={buttonClass("inverse")}>
                <Sparkles className="size-4" /> {t("today.createPlan")}
              </Link>
              <StartWorkoutButton label={t("today.quickWorkout")} variant="inverse-ghost" />
            </div>
          </div>
        )}
      </section>

      <Section title={t("today.bodyWeight")}>
        <div className="flex items-baseline justify-between">
          {latestWeight ? (
            <p>
              <span className="score text-[32px]">{formatWeight(latestWeight.weightKg, profile.unitSystem)}</span>
              <span className="ml-2 text-sm text-steel">
                {latestWeight.localDate === today ? t("today.weighedToday") : t("today.weighedOn", { date: formatLocalDate(latestWeight.localDate, undefined, intl) })}
              </span>
            </p>
          ) : (
            <p className="text-sm text-steel">{t("today.logWeighIn")}</p>
          )}
        </div>
        <WeightQuickLog date={today} units={profile.unitSystem} current={latestWeight?.localDate === today ? latestWeight.weightKg : null} />
      </Section>

      {latestPRs.length > 0 && (
        <Section title={t("today.recentRecords")} action={<span className="text-[13px] text-steel">{t("today.estimated1rm")}</span>}>
          <ul className="divide-y divide-line border-y border-line">
            {latestPRs.map((pr) => (
              <li key={pr.id} className="flex items-baseline justify-between py-2.5">
                <span className="flex items-center gap-2">
                  <Trophy className="size-4 text-steel" aria-hidden /> {exerciseName(t, pr.exercise)}
                </span>
                <span className="score text-[22px]">{formatWeight(pr.value, profile.unitSystem)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

export default function TodayPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Today />
    </Suspense>
  );
}

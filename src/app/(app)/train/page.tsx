import { Suspense } from "react";
import Link from "next/link";
import { BookOpen, ChevronRight, ClipboardList, History, ScanEye, Sparkles } from "lucide-react";
import { requireProfile } from "@/lib/session";
import { db } from "@/lib/db";
import { getActiveWorkout, getNextPlanDay } from "@/lib/queries";
import { formatLocalDate } from "@/lib/dates";
import { displayWeight, weightUnit } from "@/lib/units";
import { durationMinutes, totalVolume } from "@/lib/training/summary";
import { StartWorkoutButton } from "@/components/train/StartWorkoutButton";
import { PreExerciseCheck } from "@/components/glucose/PreExerciseCheck";
import { EmptyState, PageHeader, PageSkeleton, Section, buttonClass } from "@/components/ui";
import { getT } from "@/i18n/server";
import { INTL_LOCALE } from "@/i18n/config";
import { exerciseName } from "@/i18n/labels";

export const metadata = { title: "Train" };

async function Train() {
  const { user, profile } = await requireProfile();
  const [t, active, next, recent] = await Promise.all([
    getT(),
    getActiveWorkout(user.id),
    getNextPlanDay(user.id),
    db.workoutSession.findMany({
      where: { userId: user.id, endedAt: { not: null } },
      orderBy: { startedAt: "desc" },
      take: 5,
      include: { planDay: { select: { name: true } }, sets: { select: { exerciseId: true, weightKg: true, reps: true, isWarmup: true } } },
    }),
  ]);
  const unit = weightUnit(profile.unitSystem);

  return (
    <div className="space-y-8">
      <PageHeader title={t("train.title")} />

      {profile.diabetesMode && !active && <PreExerciseCheck userId={user.id} hypoRiskMeds={profile.hypoRiskMeds} unit={profile.glucoseUnit} />}

      <section className="rounded-card bg-panel p-5 text-panel-fg">
        {active ? (
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm opacity-70">{t("train.inProgress")}</p>
              <p className="display text-[24px]">{t("train.pickUp")}</p>
            </div>
            <Link href={`/train/workout/${active.id}`} className={buttonClass("inverse")}>{t("train.resume")}</Link>
          </div>
        ) : next ? (
          <div className="space-y-4">
            <div>
              <p className="text-sm opacity-70">{t("train.nextSession", { plan: next.plan.name })}</p>
              <p className="score mt-1 text-[44px]">{next.day.name}</p>
            </div>
            <ol className="space-y-1 text-sm">
              {next.day.exercises.map((e) => (
                <li key={e.id} className="flex justify-between gap-3">
                  <span>{exerciseName(t, e.exercise)}</span>
                  <span className="num shrink-0 opacity-70">
                    {e.sets} × {e.repMin}–{e.repMax}
                  </span>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-2">
              <StartWorkoutButton planDayId={next.day.id} label={t("train.startDay", { day: next.day.name })} variant="inverse" />
              <StartWorkoutButton label={t("train.emptyWorkout")} variant="inverse-ghost" />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="display text-[24px]">{t("train.startTraining")}</p>
              <p className="mt-1 text-sm opacity-70">{t("train.startTrainingHint")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StartWorkoutButton label={t("train.emptyWorkout")} variant="inverse" />
              <Link href="/train/plans/new" className={buttonClass("inverse-ghost")}>
                <Sparkles className="size-4" /> {t("train.createPlan")}
              </Link>
            </div>
          </div>
        )}
      </section>

      <nav aria-label={t("train.navLabel")} className="divide-y divide-line border-y border-line">
        {[
          { href: "/train/plans", icon: ClipboardList, label: t("train.plans"), hint: t("train.plansHint") },
          { href: "/train/history", icon: History, label: t("train.history"), hint: t("train.historyHint") },
          { href: "/train/exercises", icon: BookOpen, label: t("train.exercises"), hint: t("train.exercisesHint") },
          { href: "/train/form-check", icon: ScanEye, label: t("train.formCheck.title"), hint: t("train.formCheck.navHint") },
        ].map(({ href, icon: Icon, label, hint }) => (
          <Link key={href} href={href} className="flex items-center gap-3 py-3.5 hover:bg-wash">
            <Icon className="size-5 text-steel" aria-hidden />
            <span className="flex-1">
              <span className="display block text-[18px]">{label}</span>
              <span className="block text-[13px] text-steel">{hint}</span>
            </span>
            <ChevronRight className="size-4 text-steel" aria-hidden />
          </Link>
        ))}
      </nav>

      <Section title={t("train.recentWorkouts")}>
        {recent.length === 0 ? (
          <EmptyState title={t("train.noWorkouts")}>{t("train.noWorkoutsHint")}</EmptyState>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {recent.map((w) => (
              <li key={w.id}>
                <Link href={`/train/history/${w.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-wash">
                  <span>
                    <span className="display block text-[18px]">{w.planDay?.name ?? t("train.workout")}</span>
                    <span className="block text-[13px] text-steel">
                      {formatLocalDate(w.localDate, undefined, INTL_LOCALE[t.locale])}, {t("train.minutesShort", { n: durationMinutes(w.startedAt, w.endedAt) ?? "–" })},{" "}
                      {t.plural("train.exerciseCount", new Set(w.sets.map((s) => s.exerciseId)).size)}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="score block text-[24px]">{Math.round(displayWeight(totalVolume(w.sets), profile.unitSystem, 0)).toLocaleString()}</span>
                    <span className="block text-[12px] text-steel">{t("train.lifted", { unit })}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

export default function TrainPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Train />
    </Suspense>
  );
}

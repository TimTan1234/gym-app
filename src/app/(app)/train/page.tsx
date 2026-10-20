import { Suspense } from "react";
import Link from "next/link";
import { BookOpen, ChevronRight, ClipboardList, History, Sparkles } from "lucide-react";
import { requireProfile } from "@/lib/session";
import { db } from "@/lib/db";
import { getActiveWorkout, getNextPlanDay } from "@/lib/queries";
import { formatLocalDate } from "@/lib/dates";
import { displayWeight, weightUnit } from "@/lib/units";
import { durationMinutes, totalVolume } from "@/lib/training/summary";
import { StartWorkoutButton } from "@/components/train/StartWorkoutButton";
import { EmptyState, PageHeader, PageSkeleton, Section, buttonClass } from "@/components/ui";

export const metadata = { title: "Train" };

async function Train() {
  const { user, profile } = await requireProfile();
  const [active, next, recent] = await Promise.all([
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
      <PageHeader title="Train" />

      <section className="rounded-[14px] bg-panel p-5 text-panel-fg">
        {active ? (
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm opacity-70">Workout in progress</p>
              <p className="display text-[24px]">Pick up where you left off</p>
            </div>
            <Link href={`/train/workout/${active.id}`} className={buttonClass("inverse")}>Resume</Link>
          </div>
        ) : next ? (
          <div className="space-y-4">
            <div>
              <p className="text-sm opacity-70">Next session, {next.plan.name}</p>
              <p className="score mt-1 text-[44px]">{next.day.name}</p>
            </div>
            <ol className="space-y-1 text-sm">
              {next.day.exercises.map((e) => (
                <li key={e.id} className="flex justify-between gap-3">
                  <span>{e.exercise.name}</span>
                  <span className="num shrink-0 opacity-70">
                    {e.sets} × {e.repMin}–{e.repMax}
                  </span>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-2">
              <StartWorkoutButton planDayId={next.day.id} label={`Start ${next.day.name}`} variant="inverse" />
              <StartWorkoutButton label="Empty workout" variant="inverse-ghost" />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="display text-[24px]">Start training</p>
              <p className="mt-1 text-sm opacity-70">Log a free workout, or create a plan to get sessions with targets.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StartWorkoutButton label="Empty workout" variant="inverse" />
              <Link href="/train/plans/new" className={buttonClass("inverse-ghost")}>
                <Sparkles className="size-4" /> Create plan
              </Link>
            </div>
          </div>
        )}
      </section>

      <nav aria-label="Training" className="divide-y divide-line border-y border-line">
        {[
          { href: "/train/plans", icon: ClipboardList, label: "Plans", hint: "Create, edit and switch plans" },
          { href: "/train/history", icon: History, label: "History", hint: "Every workout you've finished" },
          { href: "/train/exercises", icon: BookOpen, label: "Exercises", hint: "Library, records and custom exercises" },
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

      <Section title="Recent workouts">
        {recent.length === 0 ? (
          <EmptyState title="No workouts yet">Your finished workouts will appear here.</EmptyState>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {recent.map((w) => (
              <li key={w.id}>
                <Link href={`/train/history/${w.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-wash">
                  <span>
                    <span className="display block text-[18px]">{w.planDay?.name ?? "Workout"}</span>
                    <span className="block text-[13px] text-steel">
                      {formatLocalDate(w.localDate)}, {durationMinutes(w.startedAt, w.endedAt)} min, {new Set(w.sets.map((s) => s.exerciseId)).size} exercises
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="score block text-[24px]">{Math.round(displayWeight(totalVolume(w.sets), profile.unitSystem, 0)).toLocaleString()}</span>
                    <span className="block text-[12px] text-steel">{unit} lifted</span>
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

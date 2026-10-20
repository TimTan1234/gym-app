import { Suspense } from "react";
import Link from "next/link";
import { Plus, Settings, Sparkles, Trophy } from "lucide-react";
import { requireProfile } from "@/lib/session";
import { db } from "@/lib/db";
import { getActiveWorkout, getDayNutrition, getLatestWeight, getNextPlanDay } from "@/lib/queries";
import { formatLocalDate, todayLocal } from "@/lib/dates";
import { formatWeight } from "@/lib/units";
import { MacroSummary } from "@/components/nutrition/MacroSummary";
import { WeightQuickLog } from "@/components/body/WeightQuickLog";
import { StartWorkoutButton } from "@/components/train/StartWorkoutButton";
import { PageSkeleton, Section, buttonClass } from "@/components/ui";

export const metadata = { title: "Today" };

function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

async function Today() {
  const { user, profile } = await requireProfile();
  const now = new Date();
  const today = todayLocal(profile.timezone, now);
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: profile.timezone, hour: "numeric", hourCycle: "h23" }).format(now));

  const [{ totals }, latestWeight, next, active, recentPRs] = await Promise.all([
    getDayNutrition(user.id, today),
    getLatestWeight(user.id),
    getNextPlanDay(user.id),
    getActiveWorkout(user.id),
    db.personalRecord.findMany({
      where: { userId: user.id, type: "EST_1RM" },
      orderBy: { achievedAt: "desc" },
      take: 3,
      include: { exercise: { select: { name: true } } },
    }),
  ]);

  const proteinLeft = Math.max(0, Math.round(profile.targetProteinG - totals.proteinG));

  return (
    <div className="space-y-7">
      <header className="flex items-start justify-between">
        <div>
          <p className="text-sm text-steel">{formatLocalDate(today, { weekday: "long", month: "long" })}</p>
          <h1 className="display mt-0.5 text-[28px]">
            {greeting(hour)}, {user.name.split(" ")[0]}
          </h1>
        </div>
        <Link href="/settings" aria-label="Settings" className={buttonClass("ghost", "sm")}>
          <Settings className="size-5" />
        </Link>
      </header>

      <Link href="/nutrition" aria-label="Open today's nutrition" className="block rounded-[14px] focus-visible:outline-offset-4">
        <MacroSummary totals={totals} targets={profile} compact />
      </Link>

      <div className="grid grid-cols-2 gap-2">
        <Link href="/nutrition/log" className={buttonClass("primary", "lg")}>
          <Plus className="size-5" /> Log meal
        </Link>
        <Link href={`/coach?q=${encodeURIComponent(`Suggest meals for the rest of today to hit my remaining ${proteinLeft} g protein.`)}`} className={buttonClass("secondary", "lg")}>
          <Sparkles className="size-5" /> Meal ideas
        </Link>
      </div>

      {/* The one inverted panel: the next thing to do in the gym. */}
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
              <p className="mt-2 text-sm opacity-80">{next.day.exercises.map((e) => e.exercise.name).join(", ")}</p>
            </div>
            <StartWorkoutButton planDayId={next.day.id} label={`Start ${next.day.name}`} variant="inverse" />
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="display text-[24px]">No training plan yet</p>
              <p className="mt-1 text-sm opacity-70">Let AI build one around your goal and equipment, or just start logging.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/train/plans/new" className={buttonClass("inverse")}>
                <Sparkles className="size-4" /> Create a plan
              </Link>
              <StartWorkoutButton label="Quick workout" variant="inverse-ghost" />
            </div>
          </div>
        )}
      </section>

      <Section title="Body weight">
        <div className="flex items-baseline justify-between">
          {latestWeight ? (
            <p>
              <span className="score text-[32px]">{formatWeight(latestWeight.weightKg, profile.unitSystem)}</span>
              <span className="ml-2 text-sm text-steel">
                {latestWeight.localDate === today ? "today" : `on ${formatLocalDate(latestWeight.localDate)}`}
              </span>
            </p>
          ) : (
            <p className="text-sm text-steel">Log a weigh-in to keep your targets accurate.</p>
          )}
        </div>
        <WeightQuickLog date={today} units={profile.unitSystem} current={latestWeight?.localDate === today ? latestWeight.weightKg : null} />
      </Section>

      {recentPRs.length > 0 && (
        <Section title="Recent records" action={<span className="text-[13px] text-steel">Estimated 1-rep max</span>}>
          <ul className="divide-y divide-line border-y border-line">
            {recentPRs.map((pr) => (
              <li key={pr.id} className="flex items-baseline justify-between py-2.5">
                <span className="flex items-center gap-2">
                  <Trophy className="size-4 text-steel" aria-hidden /> {pr.exercise.name}
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

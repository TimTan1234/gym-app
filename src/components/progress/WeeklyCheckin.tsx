import Link from "next/link";
import { Sparkles } from "lucide-react";
import type { CheckinResult } from "@/lib/nutrition/checkin";
import { formatLocalDate } from "@/lib/dates";
import { displayWeight, weightUnit, type UnitSystem } from "@/lib/units";
import { buttonClass } from "@/components/ui";
import { ApplyCheckinButton } from "./ApplyCheckinButton";

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

function signed(kg: number, units: UnitSystem) {
  const v = displayWeight(kg, units, 2);
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)} ${weightUnit(units)}`;
}

const COACH_QUESTION = "Run my weekly check-in.";

/** The emphasised panel on Progress: what the last two weeks say about your calorie target. */
export function WeeklyCheckin({ checkin: c, targetKcal, units }: { checkin: CheckinResult; targetKcal: number; units: UnitSystem }) {
  const coachLink = (
    <Link href={`/coach?q=${encodeURIComponent(COACH_QUESTION)}`} className={buttonClass(c.status === "adjust" ? "inverse-ghost" : "inverse")}>
      <Sparkles className="size-4" /> Ask the coach
    </Link>
  );

  return (
    <section className="space-y-4 rounded-[14px] bg-panel p-5 text-panel-fg" aria-labelledby="checkin-title" data-testid="weekly-checkin">
      <div>
        <p className="text-sm opacity-70">
          Weekly check-in, {formatLocalDate(c.start, { weekday: undefined })} to {formatLocalDate(c.end, { weekday: undefined })}
        </p>
        <h2 id="checkin-title" className="display mt-1 text-[24px]">
          {c.status === "insufficient"
            ? "Not enough data yet"
            : c.status === "on_track"
              ? "On track. Keep your targets."
              : c.status === "waiting"
                ? `Next check-in on ${formatLocalDate(c.nextOn!, { weekday: "long", month: "short" })}`
                : `Change your target to ${fmt(c.suggested!.kcal)} kcal`}
        </h2>
        {c.status === "waiting" && (
          <p className="mt-1 text-sm opacity-80">Your targets changed recently. Give them a week before adjusting again.</p>
        )}
        {c.status === "adjust" && (
          <p className="mt-1 text-sm opacity-80">
            From {fmt(targetKcal)} kcal. Protein stays at {c.suggested!.proteinG} g; carbs {c.suggested!.carbsG} g, fat {c.suggested!.fatG} g.
          </p>
        )}
      </div>

      {c.status === "insufficient" ? (
        <p className="text-sm opacity-80">
          Still needed: {c.missing.join(", ")}. The check-in compares what you eat with how your weight trend moves, so log every meal and
          weigh in most mornings.
        </p>
      ) : (
        <dl className="grid grid-cols-3 gap-3 border-t border-panel-fg/20 pt-3">
          <div>
            <dt className="text-xs opacity-70">Eaten</dt>
            <dd className="score text-[26px]">{fmt(c.avgIntakeKcal!)}</dd>
            <dd className="text-xs opacity-70">kcal a day</dd>
          </div>
          <div>
            <dt className="text-xs opacity-70">Weight trend</dt>
            <dd className="score text-[26px]">{signed(c.weeklyChangeKg!, units)}</dd>
            <dd className="text-xs opacity-70">a week</dd>
            <dd className="text-xs opacity-70">Goal {signed(c.goalWeeklyChangeKg, units)}</dd>
          </div>
          <div>
            <dt className="text-xs opacity-70">Estimated burn</dt>
            <dd className="score text-[26px]">{fmt(c.estimatedTdee!)}</dd>
            <dd className="text-xs opacity-70">kcal a day</dd>
          </div>
        </dl>
      )}

      <div className="flex flex-wrap gap-2">
        {c.status === "adjust" && <ApplyCheckinButton kcal={c.suggested!.kcal} />}
        {coachLink}
      </div>
    </section>
  );
}

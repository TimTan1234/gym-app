import { dayStatus, type CycleToday, type PeriodRow, type Prediction } from "@/lib/cycle/predict";
import { currentCycleDays } from "./CycleBits";
import type { T } from "@/i18n/translate";

const SIZE = 220;
const C = SIZE / 2;
/** Outer track: the period. */
const R_OUTER = 96;
const W_OUTER = 14;
/** Inner track: the fertile window. */
const R_INNER = 78;
const W_INNER = 5;
/** Space between two days, in px along the track. */
const GAP = 2;

/** One day's slice of a track, as a dashed circle that draws only that slice. */
function DaySegment({ r, width, index, total, color, opacity = 1 }: { r: number; width: number; index: number; total: number; color: string; opacity?: number }) {
  const circumference = 2 * Math.PI * r;
  const slice = circumference / total;
  return (
    <circle
      cx={C}
      cy={C}
      r={r}
      fill="none"
      stroke={color}
      strokeOpacity={opacity}
      strokeWidth={width}
      strokeDasharray={`${Math.max(0.5, slice - GAP)} ${circumference}`}
      strokeDashoffset={-(index * slice + GAP / 2)}
    />
  );
}

/**
 * The current cycle as a ring of days, day 1 at the top running clockwise. The
 * outer track holds the period (solid when logged, faded when predicted); the
 * thin inner track holds the fertile window, with ovulation solid. Today is a dot.
 */
export function CycleRing({
  t,
  prediction,
  periods,
  today,
  now,
  showFertile,
}: {
  t: T;
  prediction: Prediction;
  periods: PeriodRow[];
  today: string;
  now: CycleToday;
  showFertile: boolean;
}) {
  const days = currentCycleDays(prediction, today);
  const total = days.length;
  const status = days.map((d) => dayStatus(d, prediction, periods));
  const todayIndex = Math.min(now.dayOfCycle, total) - 1;
  const angle = ((todayIndex + 0.5) / total) * 2 * Math.PI - Math.PI / 2;

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="size-[220px] shrink-0" role="img" aria-label={t("cycle.ring.label", { day: now.dayOfCycle, length: prediction.cycleLength })}>
      <g transform={`rotate(-90 ${C} ${C})`}>
        {status.map((s, i) => (
          <DaySegment
            key={`o${i}`}
            r={R_OUTER}
            width={W_OUTER}
            index={i}
            total={total}
            color={s.logged || s.predicted ? "var(--plate-red)" : "var(--wash)"}
            opacity={s.predicted ? 0.35 : 1}
          />
        ))}
        {showFertile &&
          status.map((s, i) =>
            s.fertile || s.ovulation ? (
              <DaySegment key={`i${i}`} r={R_INNER} width={W_INNER} index={i} total={total} color="var(--plate-blue)" opacity={s.ovulation ? 1 : 0.35} />
            ) : null,
          )}
      </g>
      <circle cx={C + R_OUTER * Math.cos(angle)} cy={C + R_OUTER * Math.sin(angle)} r={9} fill="var(--iron)" stroke="var(--paper)" strokeWidth={3} />
      <text x={C} y={C + 8} textAnchor="middle" className="score" fontSize={60} fill="var(--iron)">
        {now.dayOfCycle}
      </text>
      <text x={C} y={C + 34} textAnchor="middle" fontSize={13} fill="var(--steel)">
        {t("cycle.ring.dayOf", { length: prediction.cycleLength })}
      </text>
    </svg>
  );
}

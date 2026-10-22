import { isUrgent, type GlucoseStatus, type GlucoseTargets } from "@/lib/glucose";

const MIN_SCALE = 2;

/** The top of a scale shared by every row, so their rises compare. */
export const riseScaleMax = (afterValues: number[], targets: GlucoseTargets) =>
  Math.max(14, Math.ceil(Math.max(...afterValues, targets.postMealMax) + 1));

/**
 * A meal's glucose before (ring) and after (dot) on one track, over the target
 * band: a dumbbell, so the length of the bar is the rise.
 */
export function RiseBar({
  before,
  after,
  status,
  targets,
  scaleMax,
}: {
  before: number | null;
  after: number;
  status: GlucoseStatus;
  targets: GlucoseTargets;
  scaleMax: number;
}) {
  const pct = (mmol: number) => ((Math.min(Math.max(mmol, MIN_SCALE), scaleMax) - MIN_SCALE) / (scaleMax - MIN_SCALE)) * 100;
  const x = (mmol: number) => `${pct(mmol)}%`;
  return (
    <svg width="100%" height="16" className="block overflow-visible" aria-hidden>
      <line x1="0" x2="100%" y1="8" y2="8" stroke="var(--line)" strokeWidth="1" />
      <rect x={x(targets.fastingMin)} y="2" width={`${pct(targets.postMealMax) - pct(targets.fastingMin)}%`} height="12" rx="3" fill="color-mix(in oklab, var(--good) 16%, transparent)" />
      {before !== null && <line x1={x(before)} x2={x(after)} y1="8" y2="8" stroke="var(--iron)" strokeWidth="2" />}
      {before !== null && <circle cx={x(before)} cy="8" r="4" fill="var(--chalk)" stroke="var(--iron)" strokeWidth="2" />}
      <circle cx={x(after)} cy="8" r="5" fill={isUrgent(status) ? "var(--alert)" : "var(--iron)"} stroke="var(--chalk)" strokeWidth="2" />
    </svg>
  );
}

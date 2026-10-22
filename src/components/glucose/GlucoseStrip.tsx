"use client";

import { useState } from "react";
import { Utensils } from "lucide-react";
import { HYPO_MMOL, isUrgent, toDisplay, unitLabel, type GlucoseStatus, type GlucoseTargets, type GlucoseUnit } from "@/lib/glucose";
import { StatusTag } from "./GlucoseBits";
import { useT } from "@/i18n/client";

export interface StripPoint {
  id: string;
  /** Minutes since local midnight. */
  minute: number;
  mmol: number;
  status: GlucoseStatus;
  today: boolean;
  /** "Fasting" or "After a meal after Nasi lemak". */
  label: string;
  /** "Today" or a short date. */
  day: string;
  time: string;
}

export interface StripMeal {
  id: string;
  minute: number;
  /** Ids of today's readings linked to this meal. */
  readingIds: string[];
}

const PLOT_H = 168;
const MEAL_LANE = 22;
const AXIS_H = 18;
const HEIGHT = PLOT_H + MEAL_LANE + AXIS_H;
const MIN_SCALE = 2;
/** A tap or hover picks the nearest reading within this many pixels. */
const HIT_PX = 24;
const HOURS = [0, 6, 12, 18, 24];

const xPct = (minute: number) => `${(minute / 1440) * 100}%`;

/**
 * A day on one strip: every reading of the last 14 days by time of day, today's
 * solid and earlier days' as faint rings, over the target band. Today's meals sit
 * under the plot, joined to the readings linked to them. Readings are separate
 * finger-prick checks, so they are never joined by a line.
 */
export function GlucoseStrip({
  points,
  meals,
  targets,
  unit,
}: {
  /** Oldest first. */
  points: StripPoint[];
  meals: StripMeal[];
  targets: GlucoseTargets;
  unit: GlucoseUnit;
}) {
  const t = useT();
  const [selectedId, setSelectedId] = useState(points.at(-1)?.id ?? null);
  const selectedIndex = points.findIndex((p) => p.id === selectedId);
  const selected = points[selectedIndex];

  const scaleMax = Math.max(14, Math.ceil(Math.max(...points.map((p) => p.mmol), targets.postMealMax) + 1));
  const y = (mmol: number) => PLOT_H - ((Math.min(Math.max(mmol, MIN_SCALE), scaleMax) - MIN_SCALE) / (scaleMax - MIN_SCALE)) * PLOT_H;
  const byId = new Map(points.map((p) => [p.id, p]));
  const u = unitLabel(unit);
  const fmt = (mmol: number) => toDisplay(mmol, unit);

  function pickNearest(e: React.PointerEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - box.left;
    const py = e.clientY - box.top;
    let best: { id: string; d: number } | null = null;
    for (const p of points) {
      const d = Math.hypot((p.minute / 1440) * box.width - px, y(p.mmol) - py);
      if (d <= HIT_PX && (!best || d < best.d || (d === best.d && p.today))) best = { id: p.id, d };
    }
    if (best) setSelectedId(best.id);
  }

  function step(e: React.KeyboardEvent) {
    const delta = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
    if (!delta || points.length === 0) return;
    e.preventDefault();
    const next = Math.min(Math.max((selectedIndex < 0 ? points.length : selectedIndex) + delta, 0), points.length - 1);
    setSelectedId(points[next].id);
  }

  return (
    <section aria-labelledby="strip-title" className="space-y-3">
      <h2 id="strip-title" className="sr-only">
        {t("glucose.chartTitle")}
      </h2>
      {selected && (
        <div aria-live="polite" data-testid="strip-reading">
          <p className="flex items-baseline gap-2">
            <span className="score text-[56px] leading-none [font-variant-numeric:proportional-nums]">{fmt(selected.mmol)}</span>
            <span className="text-sm text-steel">{u}</span>
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm">
            <span>{t("glucose.strip.when", { context: selected.label, day: selected.day, time: selected.time })}</span>
            <StatusTag status={selected.status} />
          </p>
        </div>
      )}

      <div
        role="group"
        tabIndex={0}
        aria-label={t("glucose.strip.aria")}
        onKeyDown={step}
        className="rounded-[6px] outline-offset-4 focus-visible:outline-2 focus-visible:outline-focus"
      >
        <svg
          width="100%"
          height={HEIGHT}
          className="block touch-pan-y overflow-visible select-none"
          aria-hidden
          onPointerDown={pickNearest}
          onPointerMove={(e) => e.pointerType === "mouse" && pickNearest(e)}
        >
          {/* Hour grid */}
          {HOURS.slice(1, -1).map((h) => (
            <line key={h} x1={xPct(h * 60)} x2={xPct(h * 60)} y1={0} y2={PLOT_H} stroke="var(--line)" strokeWidth={1} />
          ))}
          <line x1="0" x2="100%" y1={PLOT_H + 0.5} y2={PLOT_H + 0.5} stroke="var(--line)" strokeWidth={1} />

          {/* Target band and limits, labelled where they are */}
          <rect
            x="0"
            width="100%"
            y={y(targets.fastingMax)}
            height={y(targets.fastingMin) - y(targets.fastingMax)}
            fill="color-mix(in oklab, var(--good) 16%, transparent)"
          />
          <ThresholdLabel y={y(targets.fastingMax) + 12}>
            {t("glucose.strip.band", { min: fmt(targets.fastingMin), max: fmt(targets.fastingMax) })}
          </ThresholdLabel>
          <line x1="0" x2="100%" y1={y(targets.postMealMax)} y2={y(targets.postMealMax)} stroke="var(--steel)" strokeWidth={1} strokeDasharray="4 3" />
          <ThresholdLabel y={y(targets.postMealMax) - 5}>{t("glucose.strip.postMeal", { max: fmt(targets.postMealMax) })}</ThresholdLabel>
          <line x1="0" x2="100%" y1={y(HYPO_MMOL)} y2={y(HYPO_MMOL)} stroke="var(--alert)" strokeWidth={1} strokeDasharray="4 3" />
          <ThresholdLabel y={y(HYPO_MMOL) + 13}>{t("glucose.strip.low", { low: fmt(HYPO_MMOL) })}</ThresholdLabel>

          {/* Today's meals, joined to their readings */}
          {meals.map((m) =>
            m.readingIds.map((rid) => {
              const r = byId.get(rid);
              return r ? (
                <line key={`${m.id}:${rid}`} x1={xPct(m.minute)} y1={PLOT_H + MEAL_LANE / 2 - 3} x2={xPct(r.minute)} y2={y(r.mmol)} stroke="var(--steel)" strokeWidth={1.5} strokeDasharray="1 3" strokeLinecap="round" />
              ) : null;
            }),
          )}
          {meals.map((m) => (
            <svg key={m.id} x={xPct(m.minute)} y={PLOT_H + MEAL_LANE / 2 - 1} overflow="visible">
              <Utensils x={-7} y={0} width={14} height={14} strokeWidth={2.25} color="var(--iron)" />
            </svg>
          ))}

          {/* Earlier days behind, today on top */}
          {points
            .filter((p) => !p.today)
            .map((p) => (
              <circle
                key={p.id}
                cx={xPct(p.minute)}
                cy={y(p.mmol)}
                r={3.5}
                fill="none"
                stroke={isUrgent(p.status) ? "var(--alert)" : "var(--steel)"}
                strokeWidth={1.5}
                opacity={isUrgent(p.status) ? 1 : 0.6}
              />
            ))}
          {points
            .filter((p) => p.today)
            .map((p) => (
              <circle
                key={p.id}
                cx={xPct(p.minute)}
                cy={y(p.mmol)}
                r={5}
                fill={isUrgent(p.status) ? "var(--alert)" : "var(--iron)"}
                stroke="var(--chalk)"
                strokeWidth={2}
              />
            ))}
          {selected && <circle cx={xPct(selected.minute)} cy={y(selected.mmol)} r={9.5} fill="none" stroke="var(--iron)" strokeWidth={1.5} />}

          {/* Hours */}
          {HOURS.map((h, i) => (
            <text
              key={h}
              x={xPct(h * 60)}
              y={HEIGHT - 4}
              textAnchor={i === 0 ? "start" : i === HOURS.length - 1 ? "end" : "middle"}
              className="num fill-steel text-[11px]"
            >
              {`${String(h).padStart(2, "0")}:00`}
            </text>
          ))}
        </svg>
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-steel">
        <li className="flex items-center gap-1.5">
          <svg width="10" height="10" aria-hidden>
            <circle cx="5" cy="5" r="4" fill="var(--iron)" />
          </svg>
          {t("glucose.strip.today")}
        </li>
        <li className="flex items-center gap-1.5">
          <svg width="10" height="10" aria-hidden>
            <circle cx="5" cy="5" r="3.5" fill="none" stroke="var(--steel)" strokeWidth="1.5" />
          </svg>
          {t("glucose.strip.earlier")}
        </li>
        <li className="flex items-center gap-1.5">
          <Utensils className="size-3 text-iron" strokeWidth={2.25} aria-hidden />
          {t("glucose.strip.meal")}
        </li>
      </ul>
    </section>
  );
}

/**
 * A small label at the left end of a threshold, over the overnight hours where
 * readings are rare; haloed so a dot under it stays readable.
 */
function ThresholdLabel({ y, children }: { y: number; children: React.ReactNode }) {
  return (
    <text
      x="0"
      y={y}
      className="num fill-steel text-[11px]"
      stroke="var(--chalk)"
      strokeWidth={3}
      paintOrder="stroke"
      strokeLinejoin="round"
    >
      {children}
    </text>
  );
}

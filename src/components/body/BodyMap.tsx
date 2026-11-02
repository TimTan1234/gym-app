import { Gauge, Moon } from "lucide-react";
import type { MuscleLoad, TrainingLoad } from "@/lib/progress";
import { hoursAndMinutes, type SleepSignal } from "@/lib/activity";
import { formatLocalDate } from "@/lib/dates";
import { labelOf } from "@/i18n/labels";
import { INTL_LOCALE } from "@/i18n/config";
import { getT } from "@/i18n/server";
import { FIGURES, type FigureSide } from "./figures";
import { BodyMapPicker, type BodyMapItem } from "./BodyMapPicker";

// Our muscle names → the figure's. Parts not listed (head, hands, knees, tibialis…) are never filled.
const REGIONS: Record<string, readonly string[]> = {
  chest: ["chest"],
  shoulders: ["deltoids"],
  traps: ["trapezius"],
  back: ["upper-back", "lower-back"],
  biceps: ["biceps"],
  triceps: ["triceps"],
  forearms: ["forearm"],
  abs: ["abs", "obliques"],
  quads: ["quadriceps"],
  hamstrings: ["hamstring"],
  glutes: ["gluteal"],
  adductors: ["adductors"],
  calves: ["calves"],
};
const MUSCLE_OF = new Map(Object.entries(REGIONS).flatMap(([muscle, parts]) => parts.map((p) => [p, muscle] as const)));

/** Coral strength by working sets; a muscle that only helped gets the faintest tint. */
const LEVELS = [
  { min: 10, mix: 100, label: "10+" },
  { min: 5, mix: 68, label: "5–9" },
  { min: 1, mix: 42, label: "1–4" },
] as const;
const HELPED_MIX = 12;
const tint = (mix: number) => `color-mix(in oklab, var(--primary) ${mix}%, var(--wash))`;

function fillFor(load: MuscleLoad | undefined) {
  if (!load) return "var(--wash)";
  const level = LEVELS.find((l) => load.sets >= l.min);
  return tint(level ? level.mix : HELPED_MIX);
}

function Figure({ side, load }: { side: FigureSide; load: Map<string, MuscleLoad> }) {
  return (
    <svg viewBox={side.viewBox} className="h-full w-auto overflow-visible" aria-hidden>
      {/* Strokes stay 1px however small the figure is drawn. */}
      <path d={side.outline} style={{ fill: "var(--paper)" }} stroke="var(--iron)" strokeOpacity={0.45} strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
      {Object.entries(side.parts).map(([part, paths]) => {
        const muscle = MUSCLE_OF.get(part);
        return (
          <g
            key={part}
            data-muscle={muscle}
            style={{ fill: muscle ? fillFor(load.get(muscle)) : "var(--paper)" }}
            stroke="var(--iron)"
            strokeOpacity={muscle ? 0.35 : 0.2}
            strokeWidth={0.75}
          >
            {paths.map((d, i) => (
              <path key={i} d={d} vectorEffect="non-scaling-stroke" />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Today's hero: the body front and back, each muscle filled by how many working
 * sets it got in the last 7 days. Counts match Progress's "sets per muscle".
 */
export async function BodyMap({
  load,
  sex,
  today,
  trainingLoad,
  sleep = null,
}: {
  load: Map<string, MuscleLoad>;
  sex: "MALE" | "FEMALE";
  today: string;
  trainingLoad: TrainingLoad | null;
  /** Last night, from the linked phone; a short night asks for a lighter session. */
  sleep?: SleepSignal | null;
}) {
  const t = await getT();
  const intl = INTL_LOCALE[t.locale];
  const figure = FIGURES[sex === "FEMALE" ? "female" : "male"];
  const sets = (n: number) => t.plural("today.bodyMapSets", n);

  const items: BodyMapItem[] = [...load]
    .filter(([muscle]) => muscle in REGIONS)
    .sort(([, a], [, b]) => b.sets - a.sets || b.assisted - a.assisted)
    .map(([muscle, l]) => {
      const date = l.lastDate === today ? t("today.weighedToday") : formatLocalDate(l.lastDate, { weekday: "short" }, intl);
      const work = l.sets
        ? [sets(l.sets), l.assisted ? t.plural("today.bodyMapHelped", l.assisted) : null]
        : [t.plural("today.bodyMapOnlyHelped", l.assisted)];
      return {
        muscle,
        label: labelOf(t, "muscle", muscle),
        sets: l.sets,
        fill: fillFor(l),
        detail: [...work.filter(Boolean), t("today.bodyMapLast", { date })].join(t.locale === "zh" ? "，" : ", "),
      };
    });
  const trained = items.filter((i) => i.sets > 0);
  // Cardio and full-body work have no region; say so rather than look like an empty week.
  const unmapped = [...load].filter(([muscle, l]) => !(muscle in REGIONS) && l.sets > 0);
  const listSep = t.locale === "zh" ? "、" : ", ";
  // This week against the usual week, in words (img3's fitness/fatigue idea, from logged sets only).
  const lead = { heavier: "today.loadHeavierLead", usual: "today.loadUsualLead", lighter: "today.loadLighterLead" } as const;
  const body = { heavier: "today.loadHeavier", usual: "today.loadUsual", lighter: "today.loadLighter" } as const;
  const loadNote = trainingLoad && (
    <p className="flex gap-2.5 rounded-field border border-line px-3 py-2.5 text-sm">
      <Gauge className="mt-0.5 size-4 shrink-0 text-steel" aria-hidden />
      <span>
        <span className="font-semibold">{t(lead[trainingLoad.status])}</span>{" "}
        <span className="text-steel">
          {t(body[trainingLoad.status], {
            week: trainingLoad.week,
            usual: Math.round(trainingLoad.usual),
            pct: Math.round(Math.abs(trainingLoad.change) * 100),
          })}
        </span>
      </span>
    </p>
  );
  const { h, m } = hoursAndMinutes(sleep?.minutes ?? 0);
  const sleepNote = sleep?.short && (
    <p className="flex gap-2.5 rounded-field border border-line px-3 py-2.5 text-sm" data-testid="short-sleep">
      <Moon className="mt-0.5 size-4 shrink-0 text-steel" aria-hidden />
      <span>
        <span className="font-semibold">{t("today.shortSleepLead")}</span>{" "}
        <span className="text-steel">{t("today.shortSleep", { h, m })}</span>
      </span>
    </p>
  );
  const note =
    loadNote || sleepNote ? (
      <div className="space-y-2">
        {sleepNote}
        {loadNote}
      </div>
    ) : null;
  const label = t("today.bodyMapLabel", {
    list: trained.length ? trained.map((i) => `${i.label} ${sets(i.sets)}`).join(listSep) : t("today.bodyMapNone"),
  });

  return (
    <section aria-labelledby="body-map-title" className="relative isolate">
      {/* A soft coral glow behind the figure, fading into the canvas. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-4 -top-10 bottom-10 -z-10"
        style={{ background: "radial-gradient(60% 55% at 50% 42%, color-mix(in oklab, var(--primary) 16%, transparent), transparent 70%)" }}
      />
      <BodyMapPicker
        items={items}
        label={label}
        title={t("today.bodyMapTitle")}
        hint={trained.length ? t("today.bodyMapHint") : t("today.bodyMapEmpty")}
        note={note}
        also={unmapped.length ? t("today.bodyMapAlso", { list: unmapped.map(([m, l]) => `${labelOf(t, "muscle", m)} ${sets(l.sets)}`).join(listSep) }) : null}
        legend={{
          title: t("today.bodyMapLegend"),
          levels: [...LEVELS].reverse().map((l) => ({ label: l.label, fill: tint(l.mix) })),
          helped: { label: t("today.bodyMapLegendHelped"), fill: tint(HELPED_MIX) },
        }}
      >
        <Figure side={figure.front} load={load} />
        <Figure side={figure.back} load={load} />
      </BodyMapPicker>
    </section>
  );
}

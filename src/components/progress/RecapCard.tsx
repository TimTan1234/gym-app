// The weekly recap card, drawn into a PNG by /api/recap/image. Inline styles and flexbox only:
// the image renderer (Satori) has no stylesheet, CSS variables or grid, so colours are DESIGN.md's
// panel and plate values, written out. The card is the dark panel in light and dark mode alike.

import type { Recap } from "@/lib/recap";
import { displayWeight, weightUnit, type UnitSystem } from "@/lib/units";
import { formatLocalDate } from "@/lib/dates";
import type { T } from "@/i18n/translate";
import { INTL_LOCALE } from "@/i18n/config";

export const RECAP_SIZE = { width: 1080, height: 1350 };

// --panel and --panel-fg; muted text and rules are the foreground at lower strength.
const PANEL = "#181715";
const FG = "#faf9f5";
const MUTED = "rgba(250, 249, 245, 0.62)";
const RULE = "rgba(250, 249, 245, 0.18)";
// The plates as they read on the dark surface (the dark theme's values); red also marks records.
const PLATES = ["#6f95ec", "#c99a25", "#e5675c"];
const RECORD = PLATES[2];
const SANS = '"Inter", "Noto Sans SC"';
const SERIF = '"Source Serif 4", "Noto Sans SC"';

export interface RecapContent {
  range: string;
  /** Short sentences, one per line. */
  headline: string[];
  /** Monday to Sunday, when the week had training. `height` is against the week's busiest day. */
  strip: { letter: string; height: number; record: boolean }[] | null;
  footer: { label: string; value: string }[];
  /** All of it as text, for screen readers. */
  description: string;
}

/** What the card says, from the recap: shared by the image and its description on the page. */
export function recapContent(recap: Recap, t: T, units: UnitSystem): RecapContent {
  const intl = INTL_LOCALE[t.locale];
  const n = (v: number) => v.toLocaleString("en-US");
  const weekday = (d: string, style: "narrow" | "long") => new Date(`${d}T12:00:00Z`).toLocaleDateString(intl, { timeZone: "UTC", weekday: style });
  const kg = (v: number) => displayWeight(v, units).toFixed(1);
  const weight =
    recap.weightEndKg === null
      ? null
      : `${recap.weightStartKg === null ? "" : `${kg(recap.weightStartKg)} → `}${kg(recap.weightEndKg)} ${weightUnit(units)}`;
  const calories = recap.avgKcal === null ? null : t("progress.recap.card.caloriesValue", { kcal: n(recap.avgKcal), target: n(recap.targetKcal) });

  // Training leads; a week without it leads with what was logged instead.
  const trained = recap.workouts > 0;
  const headline = trained
    ? [
        t.plural("progress.recap.card.workouts", recap.workouts),
        recap.workingSets > 0 && t.plural("progress.recap.card.sets", recap.workingSets),
        recap.records > 0 && t.plural("progress.recap.card.records", recap.records),
      ].filter((l): l is string => !!l)
    : recap.avgKcal !== null
      ? t("progress.recap.card.kcalHeadline", { kcal: n(recap.avgKcal) }).split("\n")
      : [t("progress.recap.card.weightHeadline", { weight: weight! })];
  const footer = [
    trained && calories && { label: t("progress.recap.card.calories"), value: calories },
    (trained || recap.avgKcal !== null) && weight && { label: t("progress.recap.card.weight"), value: weight },
  ].filter((l): l is { label: string; value: string } => !!l);

  const busiest = Math.max(...recap.days.map((d) => d.sets));
  const strip = trained ? recap.days.map((d) => ({ letter: weekday(d.date, "narrow"), height: busiest ? d.sets / busiest : 0, record: d.record })) : null;
  const date = (d: string) => formatLocalDate(d, { weekday: undefined }, intl);
  const range = `${date(recap.start)} – ${date(recap.end)}`;
  const trainingDays = recap.days.filter((d) => d.sets > 0).map((d) => weekday(d.date, "long"));
  return {
    range,
    headline,
    strip,
    footer,
    description: [
      t("progress.recap.card.week", { range }),
      ...headline,
      trainingDays.length > 0 && t("progress.recap.card.trainingDays", { days: trainingDays.join(t.locale === "zh" ? "、" : ", ") }),
      ...footer.map((f) => t("progress.recap.card.line", f)),
    ]
      .filter(Boolean)
      .join(t.locale === "zh" ? "" : " "),
  };
}

const BAR_AREA = 230;
const BAR_WIDTH = 64;

function Strip({ days }: { days: NonNullable<RecapContent["strip"]> }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      {days.map((d, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 112 }}>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", height: BAR_AREA }}>
            {d.height > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", width: BAR_WIDTH, height: Math.max(36, Math.round(BAR_AREA * d.height)), borderRadius: 8, background: FG, overflow: "hidden" }}>
                {d.record && <div style={{ height: 18, background: RECORD }} />}
              </div>
            ) : (
              <div style={{ width: BAR_WIDTH, height: 6, borderRadius: 3, background: RULE }} />
            )}
          </div>
          <div style={{ fontSize: 30, color: MUTED, marginTop: 20 }}>{d.letter}</div>
        </div>
      ))}
    </div>
  );
}

export function RecapCard({ content }: { content: RecapContent }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: PANEL, color: FG, padding: 88, fontFamily: SANS }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          {PLATES.map((c) => (
            <div key={c} style={{ width: 12, height: 44, borderRadius: 4, background: c, marginRight: 8 }} />
          ))}
          <div style={{ fontSize: 38, fontWeight: 600, marginLeft: 10 }}>GymPal</div>
        </div>
        <div style={{ fontSize: 34, color: MUTED }}>{content.range}</div>
      </div>

      {/* Without a week strip below, the headline sits in the middle of the space. */}
      <div style={{ display: "flex", flexDirection: "column", marginTop: 72, ...(content.strip ? {} : { flexGrow: 1, justifyContent: "center", marginTop: 0 }) }}>
        {content.headline.map((line) => (
          <div key={line} style={{ fontFamily: SERIF, fontSize: 148, lineHeight: 1.08, letterSpacing: -3 }}>
            {line}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", marginTop: content.strip ? "auto" : 0 }}>
        {content.strip && <Strip days={content.strip} />}
        {content.footer.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", marginTop: content.strip ? 56 : 0, paddingTop: 36, borderTop: `2px solid ${RULE}` }}>
            {content.footer.map((f, i) => (
              <div key={f.label} style={{ display: "flex", fontSize: 36, marginTop: i ? 18 : 0 }}>
                <div style={{ width: 240, color: MUTED }}>{f.label}</div>
                <div>{f.value}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

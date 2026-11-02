"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/components/ui";

export interface BodyMapItem {
  muscle: string;
  label: string;
  /** Working sets (0 when it only helped). */
  sets: number;
  fill: string;
  detail: string;
}

/**
 * The figure (drawn on the server, passed as children) plus the muscle list.
 * Tapping a muscle on the figure picks the same item as its button in the list;
 * the list is the keyboard and screen-reader way in.
 */
export function BodyMapPicker({
  items,
  label,
  title,
  hint,
  note,
  also,
  legend,
  children,
}: {
  items: BodyMapItem[];
  label: string;
  title: string;
  hint: string;
  /** The week's training load against the usual week, when there's enough history. */
  note?: ReactNode;
  also: string | null;
  legend: { title: string; levels: { label: string; fill: string }[]; helped: { label: string; fill: string } };
  children: ReactNode;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const selected = items.find((i) => i.muscle === picked) ?? null;
  const trained = items.filter((i) => i.sets > 0);

  function onFigureClick(e: React.MouseEvent) {
    const muscle = (e.target as Element).closest("[data-muscle]")?.getAttribute("data-muscle");
    setPicked(muscle && muscle !== picked && items.some((i) => i.muscle === muscle) ? muscle : null);
  }

  return (
    <div>
      {/* Outline the picked muscle on both views. Muscle names come from a fixed list. */}
      {selected && <style>{`[data-body-map] g[data-muscle="${selected.muscle}"]{stroke-opacity:1;stroke-width:2px}`}</style>}
      <div role="img" aria-label={label} data-body-map data-testid="body-map" onClick={onFigureClick} className="flex h-64 cursor-pointer justify-center gap-5 py-2">
        {children}
      </div>

      <h2 id="body-map-title" className="mt-3 text-sm font-semibold">
        {title}
      </h2>
      <p aria-live="polite" className="mt-0.5 min-h-5 text-sm text-steel">
        {selected ? (
          <>
            <span className="font-semibold text-iron">{selected.label}</span>: {selected.detail}
          </>
        ) : (
          hint
        )}
      </p>

      {trained.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {trained.map((i) => (
            <li key={i.muscle}>
              <button
                type="button"
                aria-pressed={i.muscle === picked}
                onClick={() => setPicked(i.muscle === picked ? null : i.muscle)}
                className={cn(
                  "flex h-9 items-center gap-2 rounded-full border px-3 text-sm transition-colors",
                  i.muscle === picked ? "border-iron bg-wash" : "border-line bg-chalk active:bg-wash",
                )}
              >
                <span aria-hidden className="size-2.5 rounded-full" style={{ background: i.fill }} />
                {i.label}
                <span className="num text-steel">{i.sets}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {also && <p className="mt-2 text-sm text-steel">{also}</p>}
      {note && <div className="mt-3">{note}</div>}

      {/* Colour is never the only cue: the legend states the set ranges. Nothing coloured, no legend. */}
      {items.length > 0 && (
        <div aria-hidden className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-steel">
          <span>{legend.title}</span>
          {legend.levels.map((l) => (
            <span key={l.label} className="num flex items-center gap-1">
              <span className="size-2.5 rounded-full" style={{ background: l.fill }} />
              {l.label}
            </span>
          ))}
          <span className="flex items-center gap-1">
            <span className="size-2.5 rounded-full" style={{ background: legend.helped.fill }} />
            {legend.helped.label}
          </span>
        </div>
      )}
    </div>
  );
}

"use client";

import { useSyncExternalStore } from "react";
import { PLATE_SETUPS, plateMath } from "@/lib/training/plates";
import { weightUnit, type UnitSystem } from "@/lib/units";
import { useT } from "@/i18n/client";

// The chosen bar is a per-device preference shared by every barbell block.
const BAR_KEY = "gympal.bar";
const listeners = new Set<() => void>();

function readBar(): string | null {
  try {
    return localStorage.getItem(BAR_KEY);
  } catch {
    return null;
  }
}

function writeBar(value: string) {
  try {
    localStorage.setItem(BAR_KEY, value);
  } catch {
    // Storage blocked: the choice just won't persist.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function useBar(units: UnitSystem): number {
  const setup = PLATE_SETUPS[units];
  const stored = useSyncExternalStore(subscribe, readBar, () => null);
  // Stored as "<unit>:<weight>" so switching units falls back to the default bar.
  const [unit, weight] = (stored ?? "").split(":");
  const bar = Number(weight);
  return unit === units && setup.bars.includes(bar) ? bar : setup.bar;
}

/** Plates per side for the weight in the entry row, drawn as a loaded sleeve. */
export function PlateLoad({ weight, units }: { weight: number; units: UnitSystem }) {
  const t = useT();
  const setup = PLATE_SETUPS[units];
  const bar = useBar(units);
  const load = plateMath(weight, { bar, plates: setup.plates });
  const unit = weightUnit(units);
  const biggest = setup.plates[0];

  function cycleBar() {
    const next = setup.bars[(setup.bars.indexOf(bar) + 1) % setup.bars.length];
    writeBar(`${units}:${next}`);
  }

  return (
    <div className="flex items-center gap-3 text-[13px] text-steel" data-testid="plate-load">
      {load && load.perSide.length > 0 ? (
        <>
          <div aria-hidden className="flex h-10 shrink-0 items-center">
            <span className="h-[3px] w-3 bg-steel/60" />
            <span className="h-4 w-1 rounded-[1px] bg-steel" />
            {load.perSide.map((p, i) => (
              <span
                key={i}
                className="ml-[2px] rounded-[2px] bg-iron"
                style={{ height: `${Math.max(30, (p / biggest) * 100)}%`, width: p >= setup.plates[3] ? 6 : 4 }}
              />
            ))}
            <span className="h-[3px] w-2 bg-steel/60" />
          </div>
          <p className="min-w-0">
            <span className="font-medium text-iron">{t("train.eachSide")}</span>
            <span className="num text-iron">{load.perSide.join(" + ")}</span>
            {load.short > 0 && (
              <span className="num"> {t("train.plateShort", { loaded: load.loaded, unit, short: load.short })}</span>
            )}
          </p>
        </>
      ) : (
        <p>{load ? t("train.tooLight", { bar, unit }) : t("train.emptyBar", { bar, unit })}</p>
      )}
      <button
        type="button"
        onClick={cycleBar}
        title={t("train.changeBar")}
        className="-mr-2 ml-auto shrink-0 rounded-field px-2 py-1 font-medium hover:bg-wash hover:text-iron"
      >
        <span className="num">{t("train.barButton", { bar, unit })}</span>
      </button>
    </div>
  );
}

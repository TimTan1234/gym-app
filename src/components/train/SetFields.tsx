"use client";

import type { ReactNode } from "react";
import { useT } from "@/i18n/client";
import type { SetEntry } from "@/lib/training/set-entry";
import { displayDistance, displayWeight, distanceUnit, round, weightUnit, type UnitSystem } from "@/lib/units";
import { Button, Input, cn } from "@/components/ui";

/** The two value columns of a set: weight and reps, or for cardio minutes and distance. */
export function useSetColumns(cardio: boolean, units: UnitSystem): [string, string] {
  const t = useT();
  return cardio ? [t("train.minutesUnit"), distanceUnit(units)] : [weightUnit(units), t("train.reps")];
}

/** What the inputs show for a saved set. */
export function entryOf(
  set: { weightKg: number; reps: number; rpe: number | null; isWarmup: boolean; durationSec: number | null; distanceM: number | null },
  units: UnitSystem,
): SetEntry {
  return {
    weight: set.weightKg ? String(displayWeight(set.weightKg, units, 2)) : "",
    reps: String(set.reps),
    rpe: set.rpe === null ? "" : String(set.rpe),
    minutes: set.durationSec ? String(round(set.durationSec / 60, 2)) : "",
    distance: set.distanceM ? String(displayDistance(set.distanceM, units)) : "",
    isWarmup: set.isWarmup,
  };
}

/**
 * The value and RPE inputs of a set, each in a cell made by `cell`, so the logger's grid rows and
 * the history table can both hold them.
 */
export function SetInputs({
  entry,
  onChange,
  cardio,
  units,
  size = "lg",
  cell,
}: {
  entry: SetEntry;
  onChange: (patch: Partial<SetEntry>) => void;
  cardio: boolean;
  units: UnitSystem;
  size?: "md" | "lg";
  cell: (key: string, input: ReactNode) => ReactNode;
}) {
  const t = useT();
  const [first, second] = useSetColumns(cardio, units);
  const value = cn("px-1 text-center", size === "lg" ? "score h-12 text-[24px]" : "score h-10 text-[20px]");
  return (
    <>
      {cardio ? (
        <>
          {cell("a", <Input aria-label={first} type="number" inputMode="decimal" step="any" min={0} value={entry.minutes} onChange={(e) => onChange({ minutes: e.target.value })} className={value} />)}
          {cell("b", <Input aria-label={second} type="number" inputMode="decimal" step="any" min={0} value={entry.distance} onChange={(e) => onChange({ distance: e.target.value })} placeholder="–" className={value} />)}
        </>
      ) : (
        <>
          {cell("a", <Input aria-label={first} type="number" inputMode="decimal" step="any" min={0} value={entry.weight} onChange={(e) => onChange({ weight: e.target.value })} className={value} />)}
          {cell("b", <Input aria-label={second} type="number" inputMode="numeric" min={1} value={entry.reps} onChange={(e) => onChange({ reps: e.target.value })} className={value} />)}
        </>
      )}
      {cell(
        "rpe",
        <Input
          aria-label={t("train.rpe")}
          type="number"
          inputMode="decimal"
          min={1}
          max={10}
          step={0.5}
          value={entry.rpe}
          onChange={(e) => onChange({ rpe: e.target.value })}
          placeholder="–"
          className={cn("num px-1 text-center", size === "lg" ? "h-12" : "h-10")}
        />,
      )}
    </>
  );
}

/** The warm-up checkbox under a set's inputs. */
export function WarmupCheckbox({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  const t = useT();
  return (
    <label className="flex min-h-11 w-fit items-center gap-2 text-[13px] text-steel">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-[var(--iron)]" />
      {t("train.warmupCheckbox")}
    </label>
  );
}

/**
 * A saved set's row is one button into editing it: this covers the row (which must be `relative`),
 * so a tap anywhere on it opens the editor and keyboard users get a single, labelled stop.
 */
export const editRowButtonClass = "absolute inset-0 rounded-field active:bg-wash/60 disabled:pointer-events-none";

/** Under a set being edited: warm-up, then delete, cancel and save. */
export function SetEditActions({
  name,
  entry,
  onChange,
  onSave,
  onCancel,
  onDelete,
  busy,
}: {
  /** The set's number, or "warm-up". */
  name: string | number;
  entry: SetEntry;
  onChange: (patch: Partial<SetEntry>) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3">
      <WarmupCheckbox checked={entry.isWarmup} onChange={(isWarmup) => onChange({ isWarmup })} />
      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="sm" className="text-alert hover:text-alert" aria-label={t("train.deleteSet", { set: name })} onClick={onDelete} disabled={busy}>
          {t("common.delete")}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          {t("common.cancel")}
        </Button>
        <Button variant="secondary" size="sm" aria-label={t("train.saveSet", { set: name })} onClick={onSave} disabled={busy}>
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}

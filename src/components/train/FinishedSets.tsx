"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trophy } from "lucide-react";
import { deleteSet, updateSet } from "@/server/training";
import { estimate1RM } from "@/lib/training/oneRepMax";
import { parseSetEntry, type SetEntry } from "@/lib/training/set-entry";
import type { RecordType } from "@/lib/training/records";
import { displayDistance, displayWeight, formatWeight, round, type UnitSystem } from "@/lib/units";
import { useT } from "@/i18n/client";
import { SetEditActions, SetInputs, editRowButtonClass, entryOf, useSetColumns } from "./SetFields";

export interface FinishedSet {
  id: string;
  setIndex: number;
  weightKg: number;
  reps: number;
  rpe: number | null;
  isWarmup: boolean;
  durationSec: number | null;
  distanceM: number | null;
  records: RecordType[];
}

/** One exercise's sets in a finished workout, each one editable or deletable on its own. */
export function FinishedSets({ sets, cardio, units }: { sets: FinishedSet[]; cardio: boolean; units: UnitSystem }) {
  const t = useT();
  const router = useRouter();
  const [first, second] = useSetColumns(cardio, units);
  const [editing, setEditing] = useState<{ id: string; entry: SetEntry } | null>(null);
  const [pending, startTransition] = useTransition();
  const setName = (s: FinishedSet) => (s.isWarmup ? t("train.warmupWord") : s.setIndex);
  const columns = cardio ? 4 : 5;

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    startTransition(async () => {
      try {
        const res = await action();
        if (!res.ok) return void toast.error(res.error);
        setEditing(null);
        router.refresh();
      } catch {
        toast.error(t("train.offline"));
      }
    });
  }

  function save(id: string, entry: SetEntry) {
    const values = parseSetEntry(entry, cardio, units);
    if (!values) return void toast.error(t(cardio ? "train.enterTime" : "train.enterWeightReps"));
    run(() => updateSet(id, values));
  }

  return (
    <table className="w-full text-left">
      <thead>
        <tr className="border-b border-line text-[12px] text-steel">
          <th className="w-10 py-1 font-medium">{t("train.set")}</th>
          <th className="py-1 font-medium">{first}</th>
          <th className="py-1 font-medium">{second}</th>
          <th className="w-14 py-1 font-medium">{t("train.rpe")}</th>
          {!cardio && <th className="whitespace-nowrap py-1 text-right font-medium">{t("train.est1rm")}</th>}
        </tr>
      </thead>
      <tbody>
        {sets.map((s) =>
          editing?.id === s.id ? (
            <Fragment key={s.id}>
              <tr>
                <td className="pt-1.5 text-sm font-semibold text-steel">{editing.entry.isWarmup ? t("train.warmupMark") : s.setIndex}</td>
                <SetInputs
                  entry={editing.entry}
                  onChange={(patch) => setEditing({ id: s.id, entry: { ...editing.entry, ...patch } })}
                  cardio={cardio}
                  units={units}
                  size="md"
                  cell={(key, input) => (
                    <td key={key} className="pr-2 pt-1.5">
                      {input}
                    </td>
                  )}
                />
                {!cardio && <td />}
              </tr>
              <tr className="border-b border-line">
                <td colSpan={columns} className="pb-1">
                  <SetEditActions
                    name={setName(s)}
                    entry={editing.entry}
                    onChange={(patch) => setEditing({ id: s.id, entry: { ...editing.entry, ...patch } })}
                    onSave={() => save(s.id, editing.entry)}
                    onCancel={() => setEditing(null)}
                    onDelete={() => run(() => deleteSet(s.id))}
                    busy={pending}
                  />
                </td>
              </tr>
            </Fragment>
          ) : (
            <tr key={s.id} className="relative border-b border-line">
              <td className="py-1.5 text-sm font-semibold text-steel">
                {s.isWarmup ? t("train.warmupMark") : s.setIndex}
                <button
                  type="button"
                  aria-label={t("train.editSet", { set: setName(s) })}
                  onClick={() => setEditing({ id: s.id, entry: entryOf(s, units) })}
                  disabled={pending}
                  className={editRowButtonClass}
                />
              </td>
              <td className="score py-1.5 text-[22px]">{cardio ? round((s.durationSec ?? 0) / 60, 1) : displayWeight(s.weightKg, units)}</td>
              <td className="score py-1.5 text-[22px]">{cardio ? (s.distanceM ? displayDistance(s.distanceM, units) : "–") : s.reps}</td>
              <td className="num py-1.5 text-sm text-steel">{s.rpe ?? "–"}</td>
              {!cardio && (
                <td className="num whitespace-nowrap py-1.5 text-right text-sm">
                  {s.records.length > 0 && (
                    <Trophy className="mr-1 inline size-3.5" aria-label={t("train.recordAria", { types: s.records.map((r) => t(`labels.record.${r}`)).join(", ") })} />
                  )}
                  {s.isWarmup ? "–" : formatWeight(estimate1RM(s.weightKg, s.reps), units)}
                </td>
              )}
            </tr>
          ),
        )}
      </tbody>
    </table>
  );
}

"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { label } from "@/lib/format";
import { Input, Select } from "@/components/ui";

export interface PickerExercise {
  id: string;
  name: string;
  primaryMuscle: string;
  equipment: string;
  isLowerBody: boolean;
}


export function ExercisePicker({
  exercises,
  onPick,
  onClose,
}: {
  exercises: PickerExercise[];
  onPick: (ex: PickerExercise) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState("");
  const muscles = useMemo(() => [...new Set(exercises.map((e) => e.primaryMuscle))].sort(), [exercises]);
  const filtered = exercises.filter(
    (e) => (!muscle || e.primaryMuscle === muscle) && e.name.toLowerCase().includes(q.trim().toLowerCase()),
  );

  return (
    <div role="dialog" aria-modal="true" aria-label="Add exercise" className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <div className="flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-3xl bg-paper p-4 sm:rounded-3xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="display text-[22px]">Add exercise</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-lg p-2 text-steel hover:bg-wash">
            <X className="size-5" />
          </button>
        </div>
        <div className="mb-3 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-steel" />
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="pl-9" aria-label="Search exercises" />
          </div>
          <Select value={muscle} onChange={(e) => setMuscle(e.target.value)} className="w-36" aria-label="Filter by muscle">
            <option value="">All muscles</option>
            {muscles.map((m) => (
              <option key={m} value={m}>{label(m)}</option>
            ))}
          </Select>
        </div>
        <ul className="-mx-2 flex-1 overflow-y-auto">
          {filtered.map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => onPick(e)} className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left hover:bg-wash">
                <span className="font-medium">{e.name}</span>
                <span className="text-xs text-steel">
                  {label(e.primaryMuscle)}, {label(e.equipment).toLowerCase()}
                </span>
              </button>
            </li>
          ))}
          {filtered.length === 0 && <li className="px-3 py-6 text-center text-sm text-steel">No exercises found</li>}
        </ul>
      </div>
    </div>
  );
}

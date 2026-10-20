"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";
import { createCustomExercise } from "@/server/training";
import { Badge, Button, Card, Input, Label, Select } from "@/components/ui";
import { label } from "@/lib/format";

interface Ex {
  id: string;
  name: string;
  primaryMuscle: string;
  secondaryMuscles: string[];
  equipment: string;
  category: string;
  custom: boolean;
}

export function ExerciseLibrary({ exercises, muscles, equipment }: { exercises: Ex[]; muscles: string[]; equipment: string[] }) {
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState("");
  const [equip, setEquip] = useState("");
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(
    () =>
      exercises.filter(
        (e) =>
          (!muscle || e.primaryMuscle === muscle || e.secondaryMuscles.includes(muscle)) &&
          (!equip || e.equipment === equip) &&
          e.name.toLowerCase().includes(q.trim().toLowerCase()),
      ),
    [exercises, muscle, equip, q],
  );

  function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const primaryMuscle = String(f.get("muscle"));
    startTransition(async () => {
      const res = await createCustomExercise({
        name: String(f.get("name")),
        primaryMuscle,
        equipment: String(f.get("equipment")),
        category: f.get("category") as "COMPOUND" | "ISOLATION" | "CARDIO",
        isLowerBody: ["quads", "hamstrings", "glutes", "calves", "adductors"].includes(primaryMuscle),
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success("Exercise added");
      setAdding(false);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-40 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-steel" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search exercises" className="pl-9" aria-label="Search exercises" />
        </div>
        <Select value={muscle} onChange={(e) => setMuscle(e.target.value)} className="w-auto" aria-label="Muscle">
          <option value="">All muscles</option>
          {muscles.map((m) => <option key={m} value={m}>{label(m)}</option>)}
        </Select>
        <Select value={equip} onChange={(e) => setEquip(e.target.value)} className="w-auto" aria-label="Equipment">
          <option value="">All equipment</option>
          {equipment.map((m) => <option key={m} value={m}>{label(m)}</option>)}
        </Select>
      </div>

      {adding ? (
        <Card>
          <form onSubmit={create} className="grid grid-cols-2 gap-3">
            <Label className="col-span-2">Name<Input name="name" required minLength={2} maxLength={60} /></Label>
            <Label>Primary muscle
              <Select name="muscle">{muscles.map((m) => <option key={m} value={m}>{label(m)}</option>)}</Select>
            </Label>
            <Label>Equipment
              <Select name="equipment">{equipment.map((m) => <option key={m} value={m}>{label(m)}</option>)}</Select>
            </Label>
            <Label>Type
              <Select name="category">
                <option value="COMPOUND">Compound</option>
                <option value="ISOLATION">Isolation</option>
                <option value="CARDIO">Cardio</option>
              </Select>
            </Label>
            <div className="flex items-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
              <Button type="submit" disabled={pending}>Save</Button>
            </div>
          </form>
        </Card>
      ) : (
        <Button variant="secondary" onClick={() => setAdding(true)}>
          <Plus className="size-4" /> Custom exercise
        </Button>
      )}

      <p className="text-xs text-steel">{filtered.length} exercises</p>
      <ul className="divide-y divide-line rounded-[14px] border border-line bg-paper">
        {filtered.map((e) => (
          <li key={e.id}>
            <Link href={`/train/exercises/${e.id}`} className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-wash">
              <span className="font-medium">
                {e.name} {e.custom && <Badge className="ml-1">custom</Badge>}
              </span>
              <span className="shrink-0 text-xs text-steel">
                {label(e.primaryMuscle)}, {label(e.equipment).toLowerCase()}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

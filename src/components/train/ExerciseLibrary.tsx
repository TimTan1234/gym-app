"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";
import { createCustomExercise } from "@/server/training";
import { Badge, Button, Card, Input, Label, Select } from "@/components/ui";
import { useT } from "@/i18n/client";
import { exerciseName, labelOf } from "@/i18n/labels";

interface Ex {
  id: string;
  slug: string;
  name: string;
  primaryMuscle: string;
  secondaryMuscles: string[];
  equipment: string;
  category: string;
  custom: boolean;
}

export function ExerciseLibrary({ exercises, muscles, equipment }: { exercises: Ex[]; muscles: string[]; equipment: string[] }) {
  const t = useT();
  const nameOf = (e: Ex) => exerciseName(t, e);
  const muscleLabel = (m: string) => labelOf(t, "muscle", m);
  const equipmentLabel = (m: string) => labelOf(t, "equipment", m);
  const lower = (s: string) => (t.locale === "en" ? s.toLowerCase() : s);
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
          // Match the English name too, so either language finds the exercise.
          (e.name.toLowerCase().includes(q.trim().toLowerCase()) || nameOf(e).toLowerCase().includes(q.trim().toLowerCase())),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nameOf only depends on t
    [exercises, muscle, equip, q, t],
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
      toast.success(t("train.exerciseAdded"));
      setAdding(false);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-40 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-steel" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("train.searchExercises")} className="pl-9" aria-label={t("train.searchExercises")} />
        </div>
        <Select value={muscle} onChange={(e) => setMuscle(e.target.value)} className="w-auto" aria-label={t("train.muscle")}>
          <option value="">{t("train.allMuscles")}</option>
          {muscles.map((m) => <option key={m} value={m}>{muscleLabel(m)}</option>)}
        </Select>
        <Select value={equip} onChange={(e) => setEquip(e.target.value)} className="w-auto" aria-label={t("train.equipment")}>
          <option value="">{t("train.allEquipment")}</option>
          {equipment.map((m) => <option key={m} value={m}>{equipmentLabel(m)}</option>)}
        </Select>
      </div>

      {adding ? (
        <Card>
          <form onSubmit={create} className="grid grid-cols-2 gap-3">
            <Label className="col-span-2">{t("train.name")}<Input name="name" required minLength={2} maxLength={60} /></Label>
            <Label>{t("train.primaryMuscle")}
              <Select name="muscle">{muscles.map((m) => <option key={m} value={m}>{muscleLabel(m)}</option>)}</Select>
            </Label>
            <Label>{t("train.equipment")}
              <Select name="equipment">{equipment.map((m) => <option key={m} value={m}>{equipmentLabel(m)}</option>)}</Select>
            </Label>
            <Label>{t("train.type")}
              <Select name="category">
                <option value="COMPOUND">{t("train.compound")}</option>
                <option value="ISOLATION">{t("train.isolation")}</option>
                <option value="CARDIO">{t("train.cardio")}</option>
              </Select>
            </Label>
            <div className="flex items-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setAdding(false)}>{t("common.cancel")}</Button>
              <Button type="submit" disabled={pending}>{t("common.save")}</Button>
            </div>
          </form>
        </Card>
      ) : (
        <Button variant="secondary" onClick={() => setAdding(true)}>
          <Plus className="size-4" /> {t("train.customExercise")}
        </Button>
      )}

      <p className="text-xs text-steel">{t.plural("train.exercisesCount", filtered.length)}</p>
      <ul className="divide-y divide-line rounded-[14px] border border-line bg-paper">
        {filtered.map((e) => (
          <li key={e.id}>
            <Link href={`/train/exercises/${e.id}`} className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-wash">
              <span className="font-medium">
                {nameOf(e)} {e.custom && <Badge className="ml-1">{t("train.customBadge")}</Badge>}
              </span>
              <span className="shrink-0 text-xs text-steel">
                {muscleLabel(e.primaryMuscle)}
                {t.locale === "zh" ? "，" : ", "}
                {lower(equipmentLabel(e.equipment))}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

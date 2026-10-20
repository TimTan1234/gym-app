"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveProfile, type ProfileInput } from "@/server/profile";
import { ACTIVITY_LABELS } from "@/lib/nutrition/targets";
import { cmToIn, inToCm, displayWeight, inputWeightToKg, round, weightUnit } from "@/lib/units";
import { Button, Input, Label, Select, cn } from "@/components/ui";
import { useClientValue } from "@/lib/use-client";
import { EQUIPMENT_OPTIONS, EXPERIENCE_LABELS, GOAL_LABELS } from "./options";

const SERVER_TIMEZONES = ["UTC"];
let cachedTimezones: string[] | null = null;
const supportedTimezones = () =>
  (cachedTimezones ??= typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : SERVER_TIMEZONES);
const browserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

export function ProfileForm({ initial, submitLabel, redirectTo }: { initial?: Partial<ProfileInput>; submitLabel: string; redirectTo?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [units, setUnits] = useState<ProfileInput["unitSystem"]>(initial?.unitSystem ?? "METRIC");
  const [goal, setGoal] = useState<ProfileInput["goal"]>(initial?.goal ?? "MAINTAIN");
  const [equipment, setEquipment] = useState<string[]>(initial?.equipment ?? ["barbell", "dumbbell", "machine", "cable"]);
  const [error, setError] = useState<string | null>(null);
  // Browser-only values, read without hydration mismatches.
  const browserTz = useClientValue(browserTimezone, "UTC");
  const allTimezones = useClientValue(supportedTimezones, SERVER_TIMEZONES);
  const [tzChoice, setTimezone] = useState<string | null>(initial?.timezone ?? null);
  const timezone = tzChoice ?? browserTz;
  const timezones = allTimezones.includes(timezone) ? allTimezones : [timezone, ...allTimezones];

  const imperial = units === "IMPERIAL";
  const heightInit = initial?.heightCm ? (imperial ? round(cmToIn(initial.heightCm)) : round(initial.heightCm)) : "";
  const weightInit = initial?.weightKg ? displayWeight(initial.weightKg, units) : "";

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const num = (k: string) => Number(f.get(k));
    const input: ProfileInput = {
      name: String(f.get("name")),
      sex: f.get("sex") as ProfileInput["sex"],
      birthDate: String(f.get("birthDate")),
      heightCm: imperial ? inToCm(num("height")) : num("height"),
      weightKg: inputWeightToKg(num("weight"), units),
      activityLevel: f.get("activityLevel") as ProfileInput["activityLevel"],
      goal,
      rateKgPerWeek: goal === "MAINTAIN" ? 0 : inputWeightToKg(num("rate"), units),
      timezone,
      unitSystem: units,
      experience: f.get("experience") as ProfileInput["experience"],
      equipment,
    };
    setError(null);
    startTransition(async () => {
      const res = await saveProfile(input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success("Profile saved");
      if (redirectTo) router.push(redirectTo);
    });
  }

  const rateInit = initial?.rateKgPerWeek ? displayWeight(initial.rateKgPerWeek, units, 2) : imperial ? 1 : 0.5;

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <Label className="col-span-2">
          Name
          <Input name="name" required defaultValue={initial?.name ?? ""} maxLength={60} />
        </Label>
        <Label>
          Units
          <Select value={units} onChange={(e) => setUnits(e.target.value as ProfileInput["unitSystem"])}>
            <option value="METRIC">Metric (kg)</option>
            <option value="IMPERIAL">Imperial (lb)</option>
          </Select>
        </Label>
        <Label>
          Sex
          <Select name="sex" defaultValue={initial?.sex ?? "MALE"} >
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
          </Select>
        </Label>
        <Label>
          Date of birth
          <Input name="birthDate" type="date" required defaultValue={initial?.birthDate ?? ""} />
        </Label>
        <Label>
          Height ({imperial ? "in" : "cm"})
          <Input key={`h-${units}`} name="height" type="number" step="0.1" required defaultValue={heightInit} inputMode="decimal" />
        </Label>
        <Label>
          Weight ({weightUnit(units)})
          <Input key={`w-${units}`} name="weight" type="number" step="0.1" required defaultValue={weightInit} inputMode="decimal" />
        </Label>
        <Label>
          Training experience
          <Select name="experience" defaultValue={initial?.experience ?? "BEGINNER"}>
            {Object.entries(EXPERIENCE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </Label>
        <Label className="col-span-2">
          Activity level
          <Select name="activityLevel" defaultValue={initial?.activityLevel ?? "MODERATE"}>
            {Object.entries(ACTIVITY_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </Label>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Goal</legend>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(GOAL_LABELS) as ProfileInput["goal"][]).map((g) => (
            <button
              type="button"
              key={g}
              onClick={() => setGoal(g)}
              aria-pressed={goal === g}
              className={cn(
                "rounded-[10px] border px-3 py-2.5 text-sm font-semibold",
                goal === g ? "border-iron bg-iron text-iron-fg" : "border-line bg-paper text-steel hover:border-iron",
              )}
            >
              {GOAL_LABELS[g]}
            </button>
          ))}
        </div>
        {goal !== "MAINTAIN" && (
          <Label className="mt-3" hint="0.25–0.5 kg (0.5–1 lb) per week is sustainable for most people.">
            Target rate ({weightUnit(units)} per week)
            <Input key={`r-${units}`} name="rate" type="number" step="0.05" min="0.1" max={imperial ? 2 : 1} required defaultValue={rateInit} />
          </Label>
        )}
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Equipment you have access to</legend>
        <div className="flex flex-wrap gap-2">
          {EQUIPMENT_OPTIONS.map(({ value, label }) => {
            const on = equipment.includes(value);
            return (
              <button
                type="button"
                key={value}
                aria-pressed={on}
                onClick={() => setEquipment((cur) => (on ? cur.filter((x) => x !== value) : [...cur, value]))}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm",
                  on ? "border-iron bg-iron font-semibold text-iron-fg" : "border-line text-steel hover:border-iron",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-steel">Bodyweight exercises are always included.</p>
      </fieldset>

      <Label>
        Timezone
        <Select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
          {timezones.map((tz) => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </Select>
      </Label>

      {error && <p role="alert" className="text-sm text-alert">{error}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}

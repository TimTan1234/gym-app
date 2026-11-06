"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Play } from "lucide-react";
import { startWorkout } from "@/server/training";
import { READINESS, setsForReadiness, type Readiness } from "@/lib/training/readiness";
import { Button, cn, segmentClass, segmentTrack } from "@/components/ui";
import { useT } from "@/i18n/client";
import { exerciseName } from "@/i18n/labels";

interface PlanDay {
  id: string;
  exercises: { id: string; sets: number; exercise: { slug: string; name: string; category: string } }[];
}

/** Starts a workout. A plan day first asks how the user feels and shows the sets that suggests. */
export function StartWorkoutButton({
  day,
  label,
  variant = "primary",
}: {
  day?: PlanDay;
  label?: string;
  variant?: "primary" | "secondary" | "inverse" | "inverse-ghost";
}) {
  const router = useRouter();
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [asking, setAsking] = useState(false);
  const [readiness, setReadiness] = useState<Readiness>("NORMAL");

  function start(feel?: Readiness) {
    startTransition(async () => {
      const res = await startWorkout(day?.id, feel);
      if (res.ok && res.sessionId) router.push(`/train/workout/${res.sessionId}`);
      else if (!res.ok) toast.error(res.error);
    });
  }

  return (
    <>
      <Button variant={variant} disabled={pending} onClick={() => (day ? setAsking(true) : start())}>
        <Play className="size-4" /> {pending && !asking ? t("train.starting") : (label ?? t("train.startWorkout"))}
      </Button>
      {asking && day && (
        <div role="dialog" aria-modal="true" aria-label={t("train.readiness.title").replace(/[?？]$/, "")} className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 text-iron sm:items-center">
          <div className="flex max-h-[85dvh] w-full max-w-md flex-col gap-4 rounded-t-[14px] bg-paper p-5 sm:rounded-card">
            <div>
              <h2 className="display text-[22px]">{t("train.readiness.title")}</h2>
              <p className="mt-1 text-sm text-steel">{t("train.readiness.hint")}</p>
            </div>
            <div className="space-y-1.5">
              <div role="radiogroup" aria-label={t("train.readiness.title")} className={segmentTrack(true)}>
                {READINESS.map((r) => (
                  <button key={r} type="button" role="radio" aria-checked={readiness === r} onClick={() => setReadiness(r)} className={cn(segmentClass(readiness === r, true), "min-h-11")}>
                    {t(`train.readiness.${r}`)}
                  </button>
                ))}
              </div>
              <p className="text-center text-[13px] text-steel">{t(`train.readiness.${readiness}_hint`)}</p>
            </div>
            <section aria-label={t("train.readiness.recommended")} className="min-h-0 overflow-y-auto">
              <h3 className="mb-1 text-sm font-semibold">{t("train.readiness.recommended")}</h3>
              <ul className="divide-y divide-line border-y border-line text-sm">
                {day.exercises.map((e) => {
                  const sets = setsForReadiness(e.sets, e.exercise.category, readiness);
                  return (
                    <li key={e.id} className="flex justify-between gap-3 py-2">
                      <span>{exerciseName(t, e.exercise)}</span>
                      <span className={cn("num shrink-0", sets !== e.sets ? "font-semibold" : "text-steel")}>
                        {sets !== e.sets && `${e.sets} → `}
                        {t.plural("train.setCount", sets)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setAsking(false)} disabled={pending}>
                {t("common.cancel")}
              </Button>
              <Button className="flex-1" onClick={() => start(readiness)} disabled={pending}>
                <Play className="size-4" /> {pending ? t("train.starting") : t("train.readiness.start")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

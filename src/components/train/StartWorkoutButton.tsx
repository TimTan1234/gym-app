"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
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
  const trigger = useRef<HTMLButtonElement>(null);

  function close() {
    setAsking(false);
    trigger.current?.focus();
  }

  const rows = (day?.exercises ?? []).map((e) => ({
    id: e.id,
    name: exerciseName(t, e.exercise),
    planned: e.sets,
    sets: setsForReadiness(e.sets, e.exercise.category, readiness),
  }));
  const total = rows.reduce((n, r) => n + r.sets, 0);
  const planned = rows.reduce((n, r) => n + r.planned, 0);
  // The total is set large inside the sentence, wherever the language puts the number.
  const [totalBefore, totalAfter] = t(total === 1 ? "train.readiness.totalOne" : "train.readiness.totalOther").split("{n}");

  function start(feel?: Readiness) {
    startTransition(async () => {
      const res = await startWorkout(day?.id, feel);
      if (res.ok && res.sessionId) router.push(`/train/workout/${res.sessionId}`);
      else if (!res.ok) toast.error(res.error);
    });
  }

  return (
    <>
      <Button ref={trigger} variant={variant} disabled={pending} onClick={() => (day ? setAsking(true) : start())}>
        <Play className="size-4" /> {pending && !asking ? t("train.starting") : (label ?? t("train.startWorkout"))}
      </Button>
      {asking && day && (
        <div role="dialog" aria-modal="true" aria-label={t("train.readiness.title").replace(/[?？]$/, "")}
          onKeyDown={(e) => e.key === "Escape" && !pending && close()}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 text-iron sm:items-center">
          <div className="flex max-h-[85dvh] w-full max-w-md flex-col gap-4 rounded-t-[14px] bg-paper p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-card">
            <h2 className="display text-[22px]">{t("train.readiness.title")}</h2>
            <div className="space-y-1.5">
              <div role="radiogroup" aria-label={t("train.readiness.title")} className={segmentTrack(true)}>
                {READINESS.map((r) => (
                  <button key={r} type="button" role="radio" aria-checked={readiness === r} autoFocus={readiness === r} onClick={() => setReadiness(r)} className={cn(segmentClass(readiness === r, true), "min-h-11")}>
                    {t(`train.readiness.${r}`)}
                  </button>
                ))}
              </div>
              <p className="text-center text-[13px] text-steel">{t(`train.readiness.${readiness}_hint`)}</p>
            </div>
            <section aria-label={t("train.readiness.recommended")} className="flex min-h-0 flex-col gap-2">
              <p className="flex items-baseline gap-1.5 text-sm text-steel" aria-live="polite">
                {totalBefore}
                <span className="score text-[30px] text-iron">{total}</span>
                {totalAfter}
                {total !== planned && t("train.readiness.planSuffix", { planned })}
              </p>
              <ul className="min-h-0 divide-y divide-line overflow-y-auto border-y border-line">
                {rows.map(({ id, name, planned: plan, sets }) => (
                  <li key={id} className="flex items-center gap-3 py-2.5">
                    <span className="min-w-0 flex-1 text-sm font-medium">{name}</span>
                    <SetPlates planned={plan} sets={sets} />
                    <span aria-hidden className="score w-5 text-right text-[22px]">{sets}</span>
                    <span className="sr-only">
                      {t.plural("train.setCount", sets)}
                      {sets !== plan && t("train.targetPlanned", { sets: plan })}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={close} disabled={pending}>
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

/**
 * Today's sets as plates, the way the workout shows its targets: solid for each set to do,
 * dashed for planned sets a tired day leaves out, and any added sets set slightly apart.
 */
function SetPlates({ planned, sets }: { planned: number; sets: number }) {
  return (
    <span aria-hidden className="flex shrink-0 gap-1">
      {Array.from({ length: Math.max(planned, sets) }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-5 w-2 rounded-[2px] border motion-safe:transition-colors motion-safe:duration-200",
            i < sets ? "border-iron bg-iron" : "border-dashed border-steel/60 bg-transparent",
            // Sets added on a strong day stand a little apart from the planned ones.
            i === planned && "ml-1",
          )}
        />
      ))}
    </span>
  );
}

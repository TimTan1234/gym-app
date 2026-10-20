import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/session";
import { db } from "@/lib/db";
import { formatLocalDate } from "@/lib/dates";
import { displayWeight, weightUnit } from "@/lib/units";
import { best1RM } from "@/lib/training/summary";
import type { RecordType } from "@/lib/training/records";
import { TrendChart } from "@/components/charts";
import { EmptyState, PageHeader, PageSkeleton, Section } from "@/components/ui";
import { getT } from "@/i18n/server";
import { INTL_LOCALE } from "@/i18n/config";
import { exerciseName, labelOf } from "@/i18n/labels";

export const metadata = { title: "Exercise" };

async function ExerciseDetail({ params }: { params: PageProps<"/train/exercises/[id]">["params"] }) {
  const { id } = await params;
  const { user, profile } = await requireProfile();
  const t = await getT();
  const exercise = await db.exercise.findFirst({ where: { id, OR: [{ userId: null }, { userId: user.id }] } });
  if (!exercise) notFound();

  const [sets, records] = await Promise.all([
    db.workoutSet.findMany({
      where: { exerciseId: id, session: { userId: user.id, endedAt: { not: null } } },
      orderBy: { completedAt: "asc" },
      select: { exerciseId: true, weightKg: true, reps: true, isWarmup: true, rpe: true, sessionId: true, session: { select: { localDate: true } } },
    }),
    db.personalRecord.groupBy({ by: ["type"], where: { userId: user.id, exerciseId: id }, _max: { value: true } }),
  ]);

  const units = profile.unitSystem;
  const bySession = new Map<string, { date: string; sets: typeof sets }>();
  for (const s of sets) {
    const g = bySession.get(s.sessionId) ?? { date: s.session.localDate, sets: [] };
    g.sets.push(s);
    bySession.set(s.sessionId, g);
  }
  const sessions = [...bySession.entries()];
  const trend = sessions.map(([, g]) => ({ date: g.date, value: displayWeight(best1RM(g.sets), units) }));

  const lower = (s: string) => (t.locale === "en" ? s.toLowerCase() : s);
  const secondary = exercise.secondaryMuscles.map((m) => lower(labelOf(t, "muscle", m)));

  return (
    <div className="space-y-8">
      <PageHeader
        title={exerciseName(t, exercise)}
        subtitle={`${labelOf(t, "muscle", exercise.primaryMuscle)}${secondary.length ? t("train.alsoMuscles", { muscles: secondary.join(t.locale === "zh" ? "、" : ", ") }) : ""}${t.locale === "zh" ? "。" : ". "}${labelOf(t, "equipment", exercise.equipment)}${t.locale === "zh" ? "" : "."}`}
      />
      {records.length > 0 && (
        <dl className="grid grid-cols-3 divide-x divide-line border-y border-line">
          {(["EST_1RM", "MAX_WEIGHT", "MAX_VOLUME_SET"] as RecordType[]).map((type) => {
            const v = records.find((r) => r.type === type)?._max.value;
            return (
              <div key={type} className="px-3 py-3 first:pl-0">
                <dd className="score text-[28px]">
                  {v === null || v === undefined ? "–" : type === "MAX_VOLUME_SET" ? Math.round(displayWeight(v, units, 0)).toLocaleString() : displayWeight(v, units)}
                </dd>
                <dt className="text-[13px] text-steel">
                  {t("train.recordUnit", { record: t(`labels.record.${type}`), unit: weightUnit(units) })}
                </dt>
              </div>
            );
          })}
        </dl>
      )}
      {trend.length >= 2 && <TrendChart title={t("train.e1rmPerSession")} data={trend} unit={weightUnit(units)} />}
      <Section title={t("train.history")}>
        {sessions.length === 0 ? (
          <EmptyState title={t("train.notLogged")}>{t("train.notLoggedHint")}</EmptyState>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {[...sessions].reverse().map(([sessionId, g]) => (
              <li key={sessionId}>
                <Link href={`/train/history/${sessionId}`} className="flex items-center justify-between gap-3 py-3 hover:bg-wash">
                  <span>
                    <span className="block text-sm font-semibold">{formatLocalDate(g.date, undefined, INTL_LOCALE[t.locale])}</span>
                    <span className="num block text-[13px] text-steel">
                      {g.sets.filter((s) => !s.isWarmup).map((s) => `${displayWeight(s.weightKg, units)}×${s.reps}`).join(", ")}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="score block text-[22px]">{displayWeight(best1RM(g.sets), units)}</span>
                    <span className="block text-[12px] text-steel">{t("train.est1rmLower")}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

export default function ExercisePage(props: PageProps<"/train/exercises/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ExerciseDetail params={props.params} />
    </Suspense>
  );
}

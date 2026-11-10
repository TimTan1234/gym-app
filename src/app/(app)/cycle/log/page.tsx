import { Suspense } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireProfile } from "@/lib/session";
import { db } from "@/lib/db";
import { addDays, formatLocalDate, isLocalDate, todayLocal } from "@/lib/dates";
import { cycleEnabled } from "@/lib/cycle-queries";
import { isBuiltInSymptom, readSymptoms } from "@/lib/cycle/symptoms";
import { CycleDayForm } from "@/components/cycle/CycleDayForm";
import { DatePicker } from "@/components/DatePicker";
import { EmptyState, PageHeader, PageSkeleton, buttonClass, tonalIconClass } from "@/components/ui";
import { getT } from "@/i18n/server";
import { INTL_LOCALE } from "@/i18n/config";

export const metadata = { title: "Log a day" };

async function LogDay({ searchParams }: { searchParams: PageProps<"/cycle/log">["searchParams"] }) {
  const { user, profile } = await requireProfile();
  const [sp, t] = await Promise.all([searchParams, getT()]);
  const today = todayLocal(profile.timezone);

  if (!cycleEnabled(profile)) {
    return (
      <>
        <PageHeader title={t("cycle.log.title")} />
        <EmptyState
          title={t("cycle.off.title")}
          action={
            <Link href="/settings/cycle" className={buttonClass("secondary", "sm")}>
              {t("cycle.off.action")}
            </Link>
          }
        >
          {t("cycle.off.body")}
        </EmptyState>
      </>
    );
  }

  const date = typeof sp.date === "string" && isLocalDate(sp.date) && sp.date <= today ? sp.date : today;
  const [day, startsHere, endsHere] = await Promise.all([
    db.cycleDay.findUnique({ where: { userId_localDate: { userId: user.id, localDate: date } } }),
    db.period.findUnique({ where: { userId_startDate: { userId: user.id, startDate: date } }, select: { endDate: true } }),
    db.period.count({ where: { userId: user.id, endDate: date } }),
  ]);
  const symptoms = readSymptoms(day?.symptoms);
  // Custom symptoms on this day stay offered even if they've left the user's list.
  const custom = [...new Set([...profile.customSymptoms, ...symptoms.map((s) => s.name).filter((n) => !isBuiltInSymptom(n))])];
  const label = formatLocalDate(date, { weekday: "long", month: "long" }, INTL_LOCALE[t.locale]);

  return (
    <div>
      <PageHeader
        title={t("cycle.log.title")}
        action={
          <Link href="/cycle" aria-label={t("cycle.title")} className={tonalIconClass}>
            <ChevronLeft className="size-5" />
          </Link>
        }
      />
      <div className="-mt-3 mb-6">
        <DatePicker date={date} min={addDays(today, -730)} max={today} basePath="/cycle/log" label={label} />
      </div>
      <CycleDayForm
        key={date}
        date={date}
        exists={day !== null || startsHere !== null || endsHere > 0}
        customSymptoms={custom}
        initial={{
          periodStart: startsHere !== null || sp.start === "1",
          periodEnd: startsHere?.endDate === date || endsHere > 0,
          flow: day?.flow ?? null,
          symptoms,
          mood: day?.mood ?? null,
          pain: day?.pain ?? null,
          energy: day?.energy ?? null,
          note: day?.note ?? "",
        }}
      />
    </div>
  );
}

export default function CycleLogPage(props: PageProps<"/cycle/log">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <LogDay searchParams={props.searchParams} />
    </Suspense>
  );
}

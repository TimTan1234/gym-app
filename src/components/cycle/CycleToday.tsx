import Link from "next/link";
import { CalendarHeart, Plus } from "lucide-react";
import { getCycleState, type CycleProfile } from "@/lib/cycle-queries";
import { Section, buttonClass } from "@/components/ui";
import { CycleStrip, countdownText } from "./CycleBits";
import { getT } from "@/i18n/server";
import { INTL_LOCALE } from "@/i18n/config";

/** Where today sits in the cycle, with a way to log it. */
export async function CycleToday({ userId, today, profile }: { userId: string; today: string; profile: CycleProfile & { showFertileWindow: boolean } }) {
  const [{ periods, prediction, now }, t] = await Promise.all([getCycleState(userId, profile, today), getT()]);
  const intl = INTL_LOCALE[t.locale];

  return (
    <Section
      title={t("cycle.title")}
      action={
        <Link href="/cycle" className={buttonClass("ghost", "sm", "end")}>
          {t("cycle.today.seeAll")}
        </Link>
      }
    >
      <div className="space-y-4 rounded-card bg-paper p-5">
        {prediction && now ? (
          <>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="score text-[32px] leading-none">{t("cycle.today.dayOfCycle", { day: now.dayOfCycle })}</p>
              {now.phase && <p className="text-sm font-medium">{t(`cycle.phase.${now.phase}`)}</p>}
            </div>
            <p className="text-sm text-steel" data-testid="cycle-countdown">
              {countdownText(t, now, prediction, intl)}
            </p>
            <CycleStrip prediction={prediction} periods={periods} today={today} showFertile={profile.showFertileWindow} />
            <Link href={`/cycle/log?date=${today}`} className={buttonClass("secondary", "sm")}>
              <Plus className="size-4" /> {t("cycle.today.logToday")}
            </Link>
          </>
        ) : (
          <>
            <p className="text-sm text-steel">{t("cycle.today.noPeriods")}</p>
            <Link href={`/cycle/log?date=${today}&start=1`} className={buttonClass("secondary", "sm")}>
              <CalendarHeart className="size-4" /> {t("cycle.today.logLast")}
            </Link>
          </>
        )}
      </div>
    </Section>
  );
}

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, formatLocalDate } from "@/lib/dates";
import { buttonClass, cn } from "@/components/ui";
import { getT } from "@/i18n/server";
import { INTL_LOCALE } from "@/i18n/config";

export async function DateNav({ date, today, basePath }: { date: string; today: string; basePath: string }) {
  const t = await getT();
  const label =
    date === today ? t("common.today") : date === addDays(today, -1) ? t("common.yesterday") : formatLocalDate(date, undefined, INTL_LOCALE[t.locale]);
  return (
    // Pulled out by the arrows' padding so the chevrons line up with the page edges.
    <div className="-mr-3 flex items-center gap-1">
      <Link aria-label={t("today.previousDay")} href={`${basePath}?date=${addDays(date, -1)}`} className={buttonClass("ghost", "sm")}>
        <ChevronLeft className="size-4" />
      </Link>
      <span className="min-w-24 text-center text-sm font-semibold">{label}</span>
      {date < today ? (
        <Link aria-label={t("today.nextDay")} href={`${basePath}?date=${addDays(date, 1)}`} className={buttonClass("ghost", "sm")}>
          <ChevronRight className="size-4" />
        </Link>
      ) : (
        // No later day yet: a dimmed arrow keeps the control's shape.
        <span aria-hidden className={cn(buttonClass("ghost", "sm"), "pointer-events-none opacity-30")}>
          <ChevronRight className="size-4" />
        </span>
      )}
    </div>
  );
}

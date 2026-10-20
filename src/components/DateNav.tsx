import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, formatLocalDate } from "@/lib/dates";
import { buttonClass } from "@/components/ui";

export function DateNav({ date, today, basePath }: { date: string; today: string; basePath: string }) {
  const label = date === today ? "Today" : date === addDays(today, -1) ? "Yesterday" : formatLocalDate(date);
  return (
    <div className="flex items-center gap-1">
      <Link aria-label="Previous day" href={`${basePath}?date=${addDays(date, -1)}`} className={buttonClass("ghost", "sm")}>
        <ChevronLeft className="size-4" />
      </Link>
      <span className="min-w-24 text-center text-sm font-semibold">{label}</span>
      {date < today ? (
        <Link aria-label="Next day" href={`${basePath}?date=${addDays(date, 1)}`} className={buttonClass("ghost", "sm")}>
          <ChevronRight className="size-4" />
        </Link>
      ) : (
        <span className="w-10" />
      )}
    </div>
  );
}

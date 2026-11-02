"use client";

import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { isLocalDate } from "@/lib/dates";
import { useT } from "@/i18n/client";

/**
 * The day's name, with a native date input laid over it: a tap opens the phone's calendar, so any day
 * is one pick away instead of many taps on the arrows.
 */
export function DatePicker({ date, min, max, basePath, label }: { date: string; min: string; max: string; basePath: string; label: string }) {
  const router = useRouter();
  const t = useT();
  return (
    <span className="relative flex min-h-11 min-w-24 items-center justify-center gap-1.5 rounded-full px-2 text-sm font-semibold hover:bg-wash has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-iron">
      <CalendarDays className="size-4 text-steel" aria-hidden />
      <span aria-hidden>{label}</span>
      <input
        type="date"
        aria-label={t("common.chooseDate", { date: label })}
        value={date}
        min={min}
        max={max}
        // Desktop browsers only open the calendar from their own icon; open it from anywhere on the control.
        onClick={(e) => {
          try {
            e.currentTarget.showPicker();
          } catch {
            // Not supported: typing the date still works.
          }
        }}
        // Typing a year fires a change per digit (0002, 0020…): only go once the date is real and in range.
        onChange={(e) => {
          const v = e.target.value;
          if (isLocalDate(v) && v >= min && v <= max && v !== date) router.push(`${basePath}?date=${v}`);
        }}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
      />
    </span>
  );
}

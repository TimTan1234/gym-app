// Which push reminders are due for a user right now. Pure.

import { toLocalDate, toLocalTime } from "./dates";

export type ReminderKind = "WEIGH_IN" | "WORKOUT";

/** How long after its time a reminder still goes out (the sender may have been down at the minute). */
export const WINDOW_MINUTES = 180;

export interface ReminderSettings {
  weighInReminder: boolean;
  weighInTime: string;
  workoutReminder: boolean;
  workoutTime: string;
  /** 1 = Monday … 7 = Sunday. */
  workoutDays: number[];
}

export interface ReminderDay {
  /** The user's local date and time ("HH:MM"). */
  localDate: string;
  localTime: string;
  weighedIn: boolean;
  workoutStarted: boolean;
  hasActivePlan: boolean;
  /** Already sent for this local date. */
  sent: ReminderKind[];
}

/** The user's local date and time at `now`. */
export function localNow(now: Date, timezone: string) {
  return { localDate: toLocalDate(now, timezone), localTime: toLocalTime(now, timezone) };
}

/** 1 = Monday … 7 = Sunday. */
export function isoWeekday(localDate: string): number {
  return ((new Date(`${localDate}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
}

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const inWindow = (time: string, now: string) => {
  const since = minutes(now) - minutes(time);
  return since >= 0 && since < WINDOW_MINUTES;
};

export function dueReminders(s: ReminderSettings, day: ReminderDay): ReminderKind[] {
  const due: ReminderKind[] = [];
  if (s.weighInReminder && !day.weighedIn && inWindow(s.weighInTime, day.localTime)) due.push("WEIGH_IN");
  if (
    s.workoutReminder &&
    day.hasActivePlan &&
    s.workoutDays.includes(isoWeekday(day.localDate)) &&
    !day.workoutStarted &&
    inWindow(s.workoutTime, day.localTime)
  ) {
    due.push("WORKOUT");
  }
  return due.filter((k) => !day.sent.includes(k));
}

export const isTime = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

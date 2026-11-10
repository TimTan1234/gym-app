import { describe, expect, it } from "vitest";
import { dueReminders, isoWeekday, localNow, type ReminderDay, type ReminderSettings } from "@/lib/reminders";

const settings: ReminderSettings = { weighInReminder: true, weighInTime: "07:30", workoutReminder: true, workoutTime: "18:00", workoutDays: [1, 3, 5] };
// 2026-11-09 is a Monday.
const day: ReminderDay = { localDate: "2026-11-09", localTime: "07:45", weighedIn: false, workoutStarted: false, hasActivePlan: true, sent: [] };

describe("dueReminders", () => {
  it("sends the weigh-in reminder from its time, for a while, until the user weighs in", () => {
    expect(dueReminders(settings, { ...day, localTime: "07:29" })).toEqual([]);
    expect(dueReminders(settings, { ...day, localTime: "07:30" })).toEqual(["WEIGH_IN"]);
    expect(dueReminders(settings, { ...day, localTime: "10:29" })).toEqual(["WEIGH_IN"]);
    expect(dueReminders(settings, { ...day, localTime: "10:30" })).toEqual([]);
    expect(dueReminders(settings, { ...day, weighedIn: true })).toEqual([]);
    expect(dueReminders({ ...settings, weighInReminder: false }, day)).toEqual([]);
  });

  it("sends the workout reminder on training days once its time has passed without a workout", () => {
    const evening = { ...day, localTime: "18:10", weighedIn: true };
    expect(dueReminders(settings, evening)).toEqual(["WORKOUT"]);
    expect(dueReminders(settings, { ...evening, localDate: "2026-11-10" })).toEqual([]); // Tuesday
    expect(dueReminders(settings, { ...evening, workoutStarted: true })).toEqual([]);
    expect(dueReminders(settings, { ...evening, hasActivePlan: false })).toEqual([]);
    expect(dueReminders(settings, { ...evening, localTime: "17:59" })).toEqual([]);
  });

  it("never sends the same reminder twice in a day", () => {
    expect(dueReminders(settings, { ...day, sent: ["WEIGH_IN"] })).toEqual([]);
    const both = { ...settings, weighInTime: "17:00" };
    expect(dueReminders(both, { ...day, localTime: "18:30", sent: ["WEIGH_IN"] })).toEqual(["WORKOUT"]);
  });

  it("does not run a window past midnight into the next day", () => {
    expect(dueReminders({ ...settings, weighInTime: "23:00" }, { ...day, localTime: "00:30" })).toEqual([]);
  });
});

describe("localNow", () => {
  it("is the user's own date, time and weekday", () => {
    const now = new Date("2026-11-08T23:30:00Z"); // Sunday night in UTC
    expect(localNow(now, "UTC")).toEqual({ localDate: "2026-11-08", localTime: "23:30" });
    // Already Monday morning in Kuala Lumpur, still Sunday afternoon in Los Angeles.
    const kl = localNow(now, "Asia/Kuala_Lumpur");
    expect(kl).toEqual({ localDate: "2026-11-09", localTime: "07:30" });
    expect(isoWeekday(kl.localDate)).toBe(1);
    const la = localNow(now, "America/Los_Angeles");
    expect(la).toEqual({ localDate: "2026-11-08", localTime: "15:30" });
    expect(isoWeekday(la.localDate)).toBe(7);
  });
});

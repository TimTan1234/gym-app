"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { removePushSubscription, savePushSubscription, saveReminderSettings } from "@/server/reminders";
import type { ReminderSettings as Settings } from "@/lib/reminders";
import { addDays, formatLocalDate } from "@/lib/dates";
import { Input, Switch, SwitchRow, cn } from "@/components/ui";
import { useT } from "@/i18n/client";
import { INTL_LOCALE } from "@/i18n/config";
import { useClientValue } from "@/lib/use-client";

type DeviceState = "loading" | "unsupported" | "blocked" | "off" | "on";

const pushSupport = (): "unsupported" | "blocked" | "ok" =>
  !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)
    ? "unsupported"
    : Notification.permission === "denied"
      ? "blocked"
      : "ok";

/** A Monday, for weekday names. */
const MONDAY = "2026-11-09";

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const raw = atob(base64url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (base64url.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Whether this device gets notifications, and which reminders the user wants on all of them. */
export function ReminderSettings({ publicKey, hasActivePlan, initial }: { publicKey: string; hasActivePlan: boolean; initial: Settings }) {
  const t = useT();
  const support = useClientValue(pushSupport, "ok");
  const [subscribed, setDevice] = useState<DeviceState>("loading");
  const device: DeviceState = support === "ok" ? subscribed : support;
  const [settings, setSettings] = useState(initial);
  const [busy, startTransition] = useTransition();

  useEffect(() => {
    if (support !== "ok") return;
    let cancelled = false;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => !cancelled && setDevice(sub ? "on" : "off"));
    return () => {
      cancelled = true;
    };
  }, [support]);

  function switchDevice(on: boolean) {
    startTransition(async () => {
      const reg = await navigator.serviceWorker.ready;
      if (!on) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await sub.unsubscribe();
          await removePushSubscription(sub.endpoint);
        }
        return void setDevice("off");
      }
      if ((await Notification.requestPermission()) !== "granted") return void setDevice(Notification.permission === "denied" ? "blocked" : "off");
      try {
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
        const keys = sub.toJSON().keys ?? {};
        const res = await savePushSubscription({ endpoint: sub.endpoint, p256dh: keys.p256dh ?? "", auth: keys.auth ?? "", locale: t.locale });
        if (!res.ok) {
          await sub.unsubscribe();
          return void toast.error(res.error);
        }
        setDevice("on");
      } catch {
        toast.error(t("common.somethingWrong"));
      }
    });
  }

  function save(patch: Partial<Settings>) {
    const before = settings;
    const next = { ...settings, ...patch };
    setSettings(next);
    startTransition(async () => {
      const res = await saveReminderSettings(next);
      if (!res.ok) {
        setSettings(before);
        toast.error(res.error);
      }
    });
  }

  const intl = INTL_LOCALE[t.locale];
  const weekday = (i: number, style: "narrow" | "long") => formatLocalDate(addDays(MONDAY, i), { weekday: style, month: undefined, day: undefined }, intl);
  const days = Array.from({ length: 7 }, (_, i) => ({ day: i + 1, letter: weekday(i, "narrow"), name: weekday(i, "long") }));
  const deviceNote = device === "blocked" || device === "unsupported" ? t(`settings.reminders.${device}`) : device === "off" ? t("settings.reminders.offHere") : undefined;

  /** A reminder on one row: its name, then its time once it's on, then its switch. */
  const reminder = (label: string, on: boolean, toggle: (on: boolean) => void, time: string, setTime: (time: string) => void) => (
    <div className="flex min-h-11 items-center gap-3">
      <span className="min-w-0 flex-1 text-sm font-semibold">{label}</span>
      {on && (
        <Input
          type="time"
          required
          value={time}
          aria-label={t("settings.reminders.timeFor", { reminder: label })}
          onChange={(e) => e.target.value && setTime(e.target.value)}
          className="num h-9 w-auto px-2 text-sm"
        />
      )}
      <Switch checked={on} onChange={toggle} aria-label={label} />
    </div>
  );

  return (
    <div className="space-y-5">
      <SwitchRow label={t("settings.reminders.thisDevice")} hint={deviceNote} checked={device === "on"} onChange={switchDevice} disabled={busy || !["on", "off"].includes(device)} />

      <div className="border-t border-line pt-4">
        {reminder(
          t("settings.reminders.weighIn"),
          settings.weighInReminder,
          (weighInReminder) => save({ weighInReminder }),
          settings.weighInTime,
          (weighInTime) => save({ weighInTime }),
        )}
      </div>

      <div className="space-y-3 border-t border-line pt-4">
        {reminder(
          t("settings.reminders.workout"),
          settings.workoutReminder,
          (workoutReminder) => save({ workoutReminder }),
          settings.workoutTime,
          (workoutTime) => save({ workoutTime }),
        )}
        {settings.workoutReminder && (
          <>
            {/* The week as seven cells, Monday first: the same strip as the weekly recap. */}
            <div role="group" aria-label={t("settings.reminders.days")} className="grid grid-cols-7 gap-1.5">
              {days.map(({ day, letter, name }) => {
                const on = settings.workoutDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    aria-label={name}
                    aria-pressed={on}
                    onClick={() => save({ workoutDays: on ? settings.workoutDays.filter((d) => d !== day) : [...settings.workoutDays, day] })}
                    className={cn(
                      "h-11 rounded-field border text-sm font-medium transition-colors",
                      on ? "border-iron bg-iron text-chalk" : "border-line text-steel hover:border-steel hover:text-iron",
                    )}
                  >
                    <span aria-hidden>{letter}</span>
                  </button>
                );
              })}
            </div>
            {!hasActivePlan && <p className="text-sm text-steel">{t("settings.reminders.needsPlan")}</p>}
          </>
        )}
      </div>
    </div>
  );
}

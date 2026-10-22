"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Minus, Plus, X, Timer } from "lucide-react";
import { useHydrated } from "@/lib/use-client";
import { useT } from "@/i18n/client";

const STORAGE_KEY = "gympal:rest-timer";

function load(): number | null {
  try {
    const v = Number(localStorage.getItem(STORAGE_KEY));
    return v > Date.now() ? v : null;
  } catch {
    return null;
  }
}

function persist(endsAt: number | null) {
  try {
    if (endsAt) localStorage.setItem(STORAGE_KEY, String(endsAt));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable: timer still works in memory */
  }
}

/** Rest timer driven by an absolute end time so it survives reloads and tab sleeps. */
export function useRestTimer() {
  const [endsAt, setEndsAt] = useState<number | null>(() => (typeof window === "undefined" ? null : load()));
  const [now, setNow] = useState(() => Date.now());
  const firedFor = useRef<number | null>(null);
  const t = useT();
  const restOver = t("train.restOver");

  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [endsAt]);

  useEffect(() => {
    if (endsAt && now >= endsAt && firedFor.current !== endsAt) {
      firedFor.current = endsAt;
      navigator.vibrate?.([200, 100, 200]);
      if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
        new Notification(restOver, { tag: "gympal-rest" });
      }
      setEndsAt(null);
      persist(null);
    }
  }, [now, endsAt, restOver]);

  const start = useCallback((seconds: number) => {
    const t = Date.now() + seconds * 1000;
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
    setNow(Date.now());
    setEndsAt(t);
    persist(t);
  }, []);

  const adjust = useCallback((delta: number) => {
    setEndsAt((cur) => {
      if (!cur) return cur;
      const t = Math.max(Date.now() + 1000, cur + delta * 1000);
      persist(t);
      return t;
    });
  }, []);

  const stop = useCallback(() => {
    setEndsAt(null);
    persist(null);
  }, []);

  const remaining = endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : 0;
  return { running: endsAt !== null, remaining, start, adjust, stop };
}

export function RestTimerBar({ timer }: { timer: ReturnType<typeof useRestTimer> }) {
  // The timer may be restored from storage; only render after hydration.
  const hydrated = useHydrated();
  const t = useT();
  if (!hydrated || !timer.running) return null;
  const m = Math.floor(timer.remaining / 60);
  const s = String(timer.remaining % 60).padStart(2, "0");
  return (
    <div
      role="timer"
      aria-live="polite"
      // Same side offsets as the page (see the app layout), so it lines up with the content column.
      className="fixed inset-x-4 bottom-20 z-40 mx-auto flex max-w-md items-center gap-3 rounded-[14px] bg-panel px-4 py-3 text-panel-fg md:bottom-6 md:left-60 lg:right-[max(1rem,calc((100vw-56rem)/2))]"
    >
      <Timer className="size-5" />
      <span className="sr-only">{t("train.rest")}</span>
      <span className="score flex-1 text-[40px]">
        {m}:{s}
      </span>
      <button type="button" aria-label={t("train.subtract15")} onClick={() => timer.adjust(-15)} className="rounded-[8px] p-2 hover:bg-panel-fg/10">
        <Minus className="size-4" />
      </button>
      <button type="button" aria-label={t("train.add15")} onClick={() => timer.adjust(15)} className="rounded-[8px] p-2 hover:bg-panel-fg/10">
        <Plus className="size-4" />
      </button>
      <button type="button" aria-label={t("train.skipRest")} onClick={timer.stop} className="rounded-[8px] p-2 hover:bg-panel-fg/10">
        <X className="size-4" />
      </button>
    </div>
  );
}

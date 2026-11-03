"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, Minus, Plus, X, Timer } from "lucide-react";
import { useHydrated } from "@/lib/use-client";
import { useT } from "@/i18n/client";

const STORAGE_KEY = "gympal:rest-timer";

// Stored as "endsAt:totalSec"; older values hold endsAt alone.
function load(): { endsAt: number; total: number } | null {
  try {
    const [end, total] = (localStorage.getItem(STORAGE_KEY) ?? "").split(":").map(Number);
    return end > Date.now() ? { endsAt: end, total: total || Math.ceil((end - Date.now()) / 1000) } : null;
  } catch {
    return null;
  }
}

function persist(endsAt: number | null, total = 0) {
  try {
    if (endsAt) localStorage.setItem(STORAGE_KEY, `${endsAt}:${total}`);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable: timer still works in memory */
  }
}

/** Rest timer driven by an absolute end time so it survives reloads and tab sleeps. */
export function useRestTimer() {
  const [saved] = useState(() => (typeof window === "undefined" ? null : load()));
  const [endsAt, setEndsAt] = useState<number | null>(saved?.endsAt ?? null);
  // Length of this rest, for the draining bar; grows if +15 takes it past the start.
  const [total, setTotal] = useState(saved?.total ?? 0);
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
    setTotal(seconds);
    persist(t, seconds);
  }, []);

  const adjust = useCallback(
    (delta: number) => {
      if (!endsAt) return;
      const t = Math.max(Date.now() + 1000, endsAt + delta * 1000);
      const length = Math.max(total, Math.ceil((t - Date.now()) / 1000));
      setEndsAt(t);
      setTotal(length);
      persist(t, length);
    },
    [endsAt, total],
  );

  const stop = useCallback(() => {
    setEndsAt(null);
    persist(null);
  }, []);

  // A timer restored from storage only exists on the client: report it once hydrated, so the server
  // render and the hydration pass agree.
  const hydrated = useHydrated();
  const remaining = endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : 0;
  return { running: hydrated && endsAt !== null, remaining, total, start, adjust, stop };
}

export function RestTimerBar({
  timer,
  next,
}: {
  timer: ReturnType<typeof useRestTimer>;
  /** What the rest is for: tapping it scrolls to that exercise. */
  next?: { label: string; onGo?: () => void };
}) {
  const t = useT();
  if (!timer.running) return null;
  const m = Math.floor(timer.remaining / 60);
  const s = String(timer.remaining % 60).padStart(2, "0");
  const left = timer.total ? Math.min(1, timer.remaining / timer.total) : 1;
  const control = "grid size-11 place-items-center rounded-full hover:bg-panel-fg/10 active:bg-panel-fg/15";
  return (
    <div
      role="timer"
      aria-live="polite"
      // Same side offsets as the page (see the app layout), so it lines up with the content column.
      className="fixed inset-x-4 bottom-20 z-40 mx-auto max-w-md overflow-hidden rounded-card bg-panel text-panel-fg md:bottom-6 md:left-60 lg:right-[max(1rem,calc((100vw-56rem)/2))]"
    >
      {/* Rest left, draining towards the next set. */}
      <div aria-hidden className="h-1 bg-panel-fg/15">
        <div className="h-full bg-primary transition-[width] duration-300 ease-linear motion-reduce:transition-none" style={{ width: `${left * 100}%` }} />
      </div>
      <div className="flex items-center gap-1 py-2 pl-4 pr-2">
        <Timer className="mr-2 size-5 shrink-0 opacity-70" aria-hidden />
        <span className="sr-only">{t("train.rest")}</span>
        <span className="score flex-1 text-[44px]">
          {m}:{s}
        </span>
        <button type="button" aria-label={t("train.subtract15")} onClick={() => timer.adjust(-15)} className={control}>
          <Minus className="size-5" />
        </button>
        <button type="button" aria-label={t("train.add15")} onClick={() => timer.adjust(15)} className={control}>
          <Plus className="size-5" />
        </button>
        <button type="button" aria-label={t("train.skipRest")} onClick={timer.stop} className={control}>
          <X className="size-5" />
        </button>
      </div>
      {next &&
        (next.onGo ? (
          <button
            type="button"
            onClick={next.onGo}
            className="flex min-h-11 w-full items-center gap-2 border-t border-panel-fg/15 px-4 text-left text-sm hover:bg-panel-fg/10"
          >
            <span className="min-w-0 flex-1 truncate">{next.label}</span>
            <ChevronRight className="size-4 shrink-0 opacity-70" aria-hidden />
          </button>
        ) : (
          <p className="flex min-h-11 items-center border-t border-panel-fg/15 px-4 text-sm opacity-80">{next.label}</p>
        ))}
    </div>
  );
}

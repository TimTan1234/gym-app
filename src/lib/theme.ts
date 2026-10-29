"use client";

import { useSyncExternalStore } from "react";
import { THEME_KEY } from "./theme-script";

// Appearance is a per-device preference: stored in localStorage and applied
// as data-theme on <html>. "system" removes the override so the OS decides.
export type ThemePref = "system" | "light" | "dark";

const COLORS = { light: "#faf9f5", dark: "#181715" } as const;

const listeners = new Set<() => void>();
const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function resolve(pref: ThemePref): "light" | "dark" {
  return pref === "system" ? (darkQuery().matches ? "dark" : "light") : pref;
}

/** Keep the phone status bar in step with the page. */
function syncThemeColor() {
  const color = COLORS[resolve(readPref())];
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    m.setAttribute("content", color);
    m.removeAttribute("media");
  });
}

export function setThemePref(pref: ThemePref) {
  try {
    if (pref === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch {
    // Storage blocked: still apply for this page view.
  }
  if (pref === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = pref;
  syncThemeColor();
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const mq = darkQuery();
  const onSystemChange = () => {
    syncThemeColor();
    listener();
  };
  mq.addEventListener("change", onSystemChange);
  return () => {
    listeners.delete(listener);
    mq.removeEventListener("change", onSystemChange);
  };
}

export function useThemePref(): ThemePref {
  return useSyncExternalStore(subscribe, readPref, () => "system");
}

/** The theme actually showing ("system" resolved against the device). */
export function useResolvedTheme(): "light" | "dark" {
  return useSyncExternalStore(subscribe, () => resolve(readPref()), () => "light");
}

export { syncThemeColor };

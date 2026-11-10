"use client";

import { useSyncExternalStore } from "react";
import { THEME_COLORS, THEME_KEY } from "./theme-script";

// Appearance is a per-device preference: stored in localStorage and applied
// as data-theme on <html>. "system" removes the override so the OS decides.
export type ThemePref = "system" | "light" | "dark";

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

/**
 * The phone status bar's colour: the chosen theme's, or one per device scheme while on System. These metas
 * are written by the head script, not rendered by React, so navigations leave them alone; this rewrites them.
 */
function writeThemeColor(pref: ThemePref) {
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  for (const scheme of pref === "system" ? (["light", "dark"] as const) : [pref]) {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.content = THEME_COLORS[scheme];
    if (pref === "system") meta.media = `(prefers-color-scheme: ${scheme})`;
    document.head.append(meta);
  }
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
  writeThemeColor(pref);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const mq = darkQuery();
  mq.addEventListener("change", listener);
  return () => {
    listeners.delete(listener);
    mq.removeEventListener("change", listener);
  };
}

export function useThemePref(): ThemePref {
  return useSyncExternalStore(subscribe, readPref, () => "system");
}

/** The theme actually showing ("system" resolved against the device). */
export function useResolvedTheme(): "light" | "dark" {
  return useSyncExternalStore(subscribe, () => resolve(readPref()), () => "light");
}

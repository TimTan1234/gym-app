"use client";

import { useSyncExternalStore } from "react";
import { resizeImage } from "./image";
import { BACKGROUND_KEYS } from "./theme-script";

// Background photos are a per-device preference, like the theme: one per theme,
// each a downscaled JPEG data URL in localStorage, so the head script can show it
// before first paint. Which one shows follows the theme in globals.css.
export type BackgroundMode = keyof typeof BACKGROUND_KEYS;

const MODES = Object.keys(BACKGROUND_KEYS) as BackgroundMode[];
const listeners = new Set<() => void>();

function read(mode: BackgroundMode): string | null {
  try {
    return localStorage.getItem(BACKGROUND_KEYS[mode]);
  } catch {
    return null;
  }
}

function apply(mode: BackgroundMode, dataUrl: string | null) {
  const root = document.documentElement;
  if (dataUrl) root.style.setProperty(`--bg-photo-${mode}`, `url("${dataUrl}")`);
  else root.style.removeProperty(`--bg-photo-${mode}`);
  if (MODES.some((m) => root.style.getPropertyValue(`--bg-photo-${m}`))) root.dataset.bgPhoto = "";
  else delete root.dataset.bgPhoto;
  listeners.forEach((l) => l());
}

/** Downscale the picked photo, save it as this theme's background on this device and show it. Throws if it can't be read or stored. */
export async function setBackgroundPhoto(mode: BackgroundMode, file: Blob) {
  const dataUrl = await resizeImage(file, 1600, 0.8);
  localStorage.setItem(BACKGROUND_KEYS[mode], dataUrl);
  apply(mode, dataUrl);
}

export function clearBackgroundPhoto(mode: BackgroundMode) {
  try {
    localStorage.removeItem(BACKGROUND_KEYS[mode]);
  } catch {
    // Storage blocked: still clear it for this page view.
  }
  apply(mode, null);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** The theme's saved background photo as a data URL, or null for the plain canvas. */
export function useBackgroundPhoto(mode: BackgroundMode): string | null {
  return useSyncExternalStore(subscribe, () => read(mode), () => null);
}

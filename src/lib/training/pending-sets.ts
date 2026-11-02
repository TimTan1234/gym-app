"use client";

import { useSyncExternalStore } from "react";
import type { SetInput } from "@/server/training";

/** A set logged on the phone that hasn't reached the server yet (no signal in the gym). */
export interface PendingSet {
  input: SetInput;
  /** Its number in the exercise, as it will be once saved. */
  setIndex: number;
  restSec: number;
}

// One list per workout, kept on the phone so it survives the app being closed between sets.
const key = (sessionId: string) => `gympal-pending-sets:${sessionId}`;
const listeners = new Set<() => void>();
const EMPTY: PendingSet[] = [];
// Snapshots must be stable between renders: re-parse only when the stored text changes.
const cache = new Map<string, { raw: string; list: PendingSet[] }>();

function read(sessionId: string): PendingSet[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key(sessionId));
  } catch {
    return EMPTY;
  }
  if (!raw) return EMPTY;
  const hit = cache.get(sessionId);
  if (hit?.raw === raw) return hit.list;
  let list: PendingSet[] = EMPTY;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) list = parsed;
  } catch {
    // Unreadable: treat as empty rather than break the workout screen.
  }
  cache.set(sessionId, { raw, list });
  return list;
}

function write(sessionId: string, list: PendingSet[]) {
  try {
    if (list.length) localStorage.setItem(key(sessionId), JSON.stringify(list));
    else localStorage.removeItem(key(sessionId));
  } catch {
    // Storage full or blocked: the set stays on screen for this visit only.
  }
  for (const l of listeners) l();
}

export const pendingSets = {
  read,
  add: (sessionId: string, set: PendingSet) => write(sessionId, [...read(sessionId), set]),
  remove: (sessionId: string, ids: string[]) => write(sessionId, read(sessionId).filter((p) => !ids.includes(p.input.id))),
  clear: (sessionId: string) => write(sessionId, []),
};

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** This workout's queued sets; empty on the server and during hydration. */
export function usePendingSets(sessionId: string): PendingSet[] {
  return useSyncExternalStore(subscribe, () => read(sessionId), () => EMPTY);
}

/** A set id made on the phone. randomUUID needs HTTPS; fall back to random bytes elsewhere. */
export function newSetId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}

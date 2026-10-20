"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/**
 * Read a browser-only value without a hydration mismatch: the server (and the
 * hydration pass) see `serverValue`, the client then re-renders with `get()`.
 * `get` must return a stable (primitive or cached) value.
 */
export function useClientValue<T>(get: () => T, serverValue: T): T {
  return useSyncExternalStore(noopSubscribe, get, () => serverValue);
}

/** True once the component is rendering on the client after hydration. */
export function useHydrated(): boolean {
  return useClientValue(() => true, false);
}

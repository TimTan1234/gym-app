"use client";

import { useEffect, useState } from "react";

const ARMED_MS = 4000;

/**
 * A destructive action that needs a second tap: the first tap arms it (the
 * control says "Tap again to delete") and it disarms on its own after a few seconds.
 */
export function useConfirmTap(action: () => void) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), ARMED_MS);
    return () => clearTimeout(timer);
  }, [armed]);
  return {
    armed,
    tap: () => {
      if (armed) {
        setArmed(false);
        action();
      } else setArmed(true);
    },
  };
}

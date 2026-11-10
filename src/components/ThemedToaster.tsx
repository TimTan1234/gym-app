"use client";

import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { syncThemeColor, useResolvedTheme } from "@/lib/theme";
import { useClientValue } from "@/lib/use-client";

const GAP = 8;
/** How far above the screen's bottom edge a bar can sit and still count as floating there. */
const NEAR_BOTTOM = 120;

/**
 * Toasts sit at the bottom, just above the highest thing floating there: the tab bar, the rest timer,
 * a floating or sticky action. Each marks itself data-toasts-above; this finds the top of the highest
 * one anchored near the bottom edge (not one scrolled up the page, nor the desktop side bar).
 */
function useToastBottom() {
  const [bottom, setBottom] = useState(16);
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const height = window.innerHeight;
        const tops = [...document.querySelectorAll<HTMLElement>("[data-toasts-above]")]
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.height > 0 && r.top > 0 && height - r.bottom <= NEAR_BOTTOM)
          .map((r) => r.top);
        setBottom(tops.length ? Math.round(height - Math.min(...tops)) + GAP : 16);
      });
    };
    measure();
    const observer = new MutationObserver(measure);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
    };
  }, []);
  return bottom;
}

/** Toasts follow the chosen theme (Sonner defaults to light otherwise). */
export function ThemedToaster() {
  const theme = useResolvedTheme();
  // Lives outside the language provider; the head script has already set <html lang>.
  const zh = useClientValue(() => document.documentElement.lang === "zh-Hans", false);
  const bottom = useToastBottom();
  useEffect(syncThemeColor, [theme]);
  return (
    <Toaster
      position="bottom-center"
      offset={{ bottom }}
      mobileOffset={{ bottom }}
      richColors
      closeButton
      theme={theme}
      containerAriaLabel={zh ? "通知" : "Notifications"}
    />
  );
}

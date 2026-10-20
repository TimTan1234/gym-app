"use client";

import { useEffect } from "react";
import { Toaster } from "sonner";
import { syncThemeColor, useResolvedTheme } from "@/lib/theme";
import { useClientValue } from "@/lib/use-client";

/** Toasts follow the chosen theme (Sonner defaults to light otherwise). */
export function ThemedToaster() {
  const theme = useResolvedTheme();
  // Lives outside the language provider; the head script has already set <html lang>.
  const zh = useClientValue(() => document.documentElement.lang === "zh-Hans", false);
  useEffect(syncThemeColor, [theme]);
  return <Toaster position="top-center" richColors closeButton theme={theme} containerAriaLabel={zh ? "通知" : "Notifications"} />;
}

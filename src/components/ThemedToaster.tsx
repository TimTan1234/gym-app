"use client";

import { useEffect } from "react";
import { Toaster } from "sonner";
import { syncThemeColor, useResolvedTheme } from "@/lib/theme";

/** Toasts follow the chosen theme (Sonner defaults to light otherwise). */
export function ThemedToaster() {
  const theme = useResolvedTheme();
  useEffect(syncThemeColor, [theme]);
  return <Toaster position="top-center" richColors closeButton theme={theme} />;
}

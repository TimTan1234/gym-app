import { getLocale } from "./server";
import { I18nProvider } from "./client";
import type { ReactNode } from "react";

/** Reads the language cookie (so it must sit inside a Suspense boundary) and provides it to client components. */
export async function LocaleBoundary({ children }: { children: ReactNode }) {
  return <I18nProvider locale={await getLocale()}>{children}</I18nProvider>;
}

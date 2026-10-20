"use client";

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { DEFAULT_LOCALE, HTML_LANG, type Locale } from "./config";
import { createT, type T } from "./translate";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  useEffect(() => {
    document.documentElement.lang = HTML_LANG[locale];
  }, [locale]);
  return <LocaleContext value={locale}>{children}</LocaleContext>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useT(): T {
  const locale = useLocale();
  return useMemo(() => createT(locale), [locale]);
}

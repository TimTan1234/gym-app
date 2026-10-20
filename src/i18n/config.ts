// Supported languages. English is the source of truth for every message.
export const LOCALES = ["en", "zh"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "gympal-locale";

/** BCP 47 tags for <html lang> (Simplified Chinese, as used in Malaysia). */
export const HTML_LANG: Record<Locale, string> = { en: "en", zh: "zh-Hans" };
/** Intl locale for dates and numbers. */
export const INTL_LOCALE: Record<Locale, string> = { en: "en-US", zh: "zh-CN" };
export const LOCALE_NAMES: Record<Locale, string> = { en: "English", zh: "简体中文" };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Pick a locale from an Accept-Language header (zh-* → zh, else English). */
export function localeFromAcceptLanguage(header: string | null): Locale {
  if (!header) return DEFAULT_LOCALE;
  for (const part of header.split(",")) {
    const tag = part.split(";")[0].trim().toLowerCase();
    if (tag.startsWith("zh")) return "zh";
    if (tag.startsWith("en")) return "en";
  }
  return DEFAULT_LOCALE;
}

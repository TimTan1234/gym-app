import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE, isLocale, localeFromAcceptLanguage, type Locale } from "./config";
import { createT } from "./translate";

/** The visitor's language: their saved choice, else the browser's, else English. */
export const getLocale = cache(async (): Promise<Locale> => {
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(saved)) return saved;
  return localeFromAcceptLanguage((await headers()).get("accept-language"));
});

export async function getT() {
  return createT(await getLocale());
}

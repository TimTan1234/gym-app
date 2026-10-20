"use server";

import { cookies } from "next/headers";
import { LOCALE_COOKIE, isLocale, type Locale } from "@/i18n/config";
import type { ActionResult } from "./profile";

/** Save the interface language on this device (one year). */
export async function setLocale(locale: Locale): Promise<ActionResult> {
  if (!isLocale(locale)) return { ok: false, error: "Unsupported language" };
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return { ok: true };
}

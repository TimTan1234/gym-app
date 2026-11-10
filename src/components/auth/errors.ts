import { messages } from "@/i18n/messages";
import type { T } from "@/i18n/translate";

/** Known Better Auth codes get a translated message; anything else shows the server's text. */
export function authErrorText(t: T, error: { code?: string; message?: string }): string {
  const code = error.code;
  return code && code in messages.en.auth.errors
    ? t(`auth.errors.${code as keyof typeof messages.en.auth.errors}`)
    : (error.message ?? t("auth.genericError"));
}

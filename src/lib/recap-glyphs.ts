// The characters the weekly recap image can show, which its bundled fonts must cover.
import { zh } from "@/i18n/messages/progress";

/** Copy, numbers, units and English dates. */
export const LATIN = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join("") + "–—−×·…’→";

/** The week strip's day letters in Chinese, Monday first. */
export const zhDayLetters = () => Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2026, 10, 9 + i)).toLocaleDateString("zh-CN", { timeZone: "UTC", weekday: "narrow" }));

/** The Chinese card copy, dates ("11月2日") and day letters, less the placeholders. */
export function cardChinese(): string {
  const copy = [...Object.values(zh.recap.card), zh.recap.title, ...zhDayLetters()].join("").replace(/\{[^}]*\}/g, "");
  return [...new Set([...copy, ..."0123456789年月日", "，"])].filter((c) => c.charCodeAt(0) > 0x7e).sort().join("");
}

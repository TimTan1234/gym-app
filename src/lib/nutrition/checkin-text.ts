import type { CheckinMissing } from "./checkin";
import type { T } from "@/i18n/translate";

/** One thing the check-in still needs, in the reader's language. */
export function describeMissing(t: T, m: CheckinMissing): string {
  switch (m.code) {
    case "loggedDays":
      return t.plural("progress.checkin.loggedDays", m.n);
    case "weighIns":
      return t.plural("progress.checkin.weighIns", m.n);
    case "weighInSpread":
      return t("progress.checkin.weighInSpread", { days: m.days });
    case "incompleteLogs":
      return t("progress.checkin.incompleteLogs");
  }
}

// Local-date helpers. Daily totals are always bucketed by the user's local
// calendar date (YYYY-MM-DD in their IANA timezone), never by UTC date.

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Calendar date of `date` as seen in `timezone`, formatted YYYY-MM-DD. */
export function toLocalDate(date: Date, timezone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function todayLocal(timezone: string, now: Date = new Date()): string {
  return toLocalDate(now, timezone);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isLocalDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Add whole days to a YYYY-MM-DD string (calendar arithmetic, DST-safe). */
export function addDays(localDate: string, days: number): string {
  const d = new Date(`${localDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Inclusive list of dates from `start` to `end`. */
export function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Monday of the week containing `localDate`. */
export function startOfWeek(localDate: string): string {
  const d = new Date(`${localDate}T00:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  return addDays(localDate, -offset);
}

export function ageOn(birthDate: Date, localDate: string): number {
  const [y, m, d] = localDate.split("-").map(Number);
  let age = y - birthDate.getUTCFullYear();
  const beforeBirthday =
    m < birthDate.getUTCMonth() + 1 ||
    (m === birthDate.getUTCMonth() + 1 && d < birthDate.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function formatLocalDate(localDate: string, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(`${localDate}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    ...opts,
  });
}

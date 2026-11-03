// Reads a Luna export (Settings → Export: luna-backup-*.json or luna-daily-logs-*.csv)
// into GymPal periods and cycle days. Only the cycle data is kept: flow,
// symptoms with severity, mood, pain, energy and notes.
//
// Records for the same date are merged: highest severity per symptom, strongest
// flow, highest pain, notes joined. A period's own symptoms and flow count as a
// log for its start date. In a CSV each period end attaches to the latest start
// up to 14 days before it.

import { daysBetween, isLocalDate } from "@/lib/dates";
import { MAX_END_AFTER_START, type PeriodRow } from "./predict";
import {
  BUILT_IN_SYMPTOMS,
  FLOW_RANK,
  MAX_CUSTOM_SYMPTOM_CHARS,
  SEVERITY_RANK,
  type FlowValue,
  type MoodValue,
  type Severity,
  type SymptomEntry,
} from "./symptoms";

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

export interface ImportedDay {
  localDate: string;
  flow: FlowValue | null;
  symptoms: SymptomEntry[];
  mood: MoodValue | null;
  pain: number | null;
  energy: number | null;
  note: string | null;
}

export interface LunaImport {
  periods: PeriodRow[];
  days: ImportedDay[];
  /** Symptoms that aren't built in, as Luna stored them. */
  customSymptoms: string[];
  /** Records skipped for an impossible date. */
  invalid: number;
}

export type LunaImportErrorKey = "notLuna" | "unreadable";

export class LunaImportError extends Error {
  constructor(readonly key: LunaImportErrorKey) {
    super(key);
  }
}

/** A record as Luna stores it, before normalising. */
interface RawRecord {
  date: string;
  symptoms?: unknown;
  flow?: unknown;
  notes?: unknown;
  healthMetrics?: unknown;
  /** A period's own fields, read as a log for its start; its date is checked with the period. */
  fromPeriod?: boolean;
}

interface RawPeriod {
  startDate: string;
  endDate: string | null;
}

/** "2025-3-7" → "2025-03-07"; null for anything that isn't a real calendar date. */
export function normalizeDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value.trim());
  if (!m) return null;
  const date = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return isLocalDate(date) ? date : null;
}

/** "Medium", "medium" and "flow_Medium" all mean MEDIUM. */
export function normalizeFlow(value: unknown): FlowValue | null {
  if (typeof value !== "string") return null;
  const v = value.trim().replace(/^(flow_)+/i, "").toUpperCase();
  return v in FLOW_RANK ? (v as FlowValue) : null;
}

const SYMPTOM_KEYS = new Map(BUILT_IN_SYMPTOMS.map((k) => [k.replace("_", " ").toLowerCase(), k]));
const SEVERITIES: Record<string, Severity> = { mild: "MILD", moderate: "MODERATE", severe: "SEVERE" };
const MOODS: Record<string, MoodValue> = { "very low": "VERY_LOW", low: "LOW", neutral: "NEUTRAL", good: "GOOD", great: "GREAT" };

function symptomName(raw: string): string {
  const name = raw.trim();
  return SYMPTOM_KEYS.get(name.toLowerCase()) ?? name.slice(0, MAX_CUSTOM_SYMPTOM_CHARS);
}

/** Luna symptoms are plain names (older logs) or { name, severity }. */
function readLunaSymptoms(value: unknown): SymptomEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((s): SymptomEntry[] => {
    if (typeof s === "string") return s.trim() ? [{ name: symptomName(s), severity: "MILD" }] : [];
    if (!s || typeof s !== "object" || typeof s.name !== "string" || !s.name.trim()) return [];
    return [{ name: symptomName(s.name), severity: SEVERITIES[String(s.severity).toLowerCase()] ?? "MILD" }];
  });
}

function intIn(value: unknown, min: number, max: number): number | null {
  const n = Number(value);
  return value === null || value === undefined || value === "" || !Number.isFinite(n) ? null : Math.min(max, Math.max(min, Math.round(n)));
}

/** One entry per symptom, at its highest severity. */
function mergeSymptoms(list: SymptomEntry[]): SymptomEntry[] {
  const byName = new Map<string, SymptomEntry>();
  for (const s of list) {
    const cur = byName.get(s.name);
    if (!cur || SEVERITY_RANK[s.severity] > SEVERITY_RANK[cur.severity]) byName.set(s.name, s);
  }
  return [...byName.values()];
}

function toDay(date: string, r: RawRecord): ImportedDay {
  const m = r.healthMetrics && typeof r.healthMetrics === "object" ? (r.healthMetrics as Record<string, unknown>) : {};
  const note = typeof r.notes === "string" && r.notes.trim() ? r.notes.trim() : null;
  return {
    localDate: date,
    flow: normalizeFlow(r.flow),
    symptoms: mergeSymptoms(readLunaSymptoms(r.symptoms)),
    mood: MOODS[String(m.mood ?? "").toLowerCase()] ?? null,
    pain: intIn(m.painScore, 0, 10),
    energy: intIn(m.energyLevel, 1, 5),
    note,
  };
}

function mergeDays(a: ImportedDay, b: ImportedDay): ImportedDay {
  const notes = [...new Set([a.note, b.note].filter((n): n is string => n !== null))];
  return {
    localDate: a.localDate,
    flow: a.flow && b.flow ? (FLOW_RANK[a.flow] >= FLOW_RANK[b.flow] ? a.flow : b.flow) : (a.flow ?? b.flow),
    symptoms: mergeSymptoms([...a.symptoms, ...b.symptoms]),
    mood: a.mood ?? b.mood,
    pain: a.pain === null ? b.pain : b.pain === null ? a.pain : Math.max(a.pain, b.pain),
    energy: a.energy ?? b.energy,
    note: notes.length ? notes.join("\n\n") : null,
  };
}

const isEmpty = (d: ImportedDay) => !d.flow && d.symptoms.length === 0 && !d.mood && d.pain === null && d.energy === null && !d.note;

/** Merge and validate raw Luna records into the import result. */
function build(records: RawRecord[], rawPeriods: RawPeriod[]): LunaImport {
  let invalid = 0;
  const days = new Map<string, ImportedDay>();
  for (const r of records) {
    const date = normalizeDate(r.date);
    if (!date) {
      if (!r.fromPeriod) invalid += 1;
      continue;
    }
    const day = toDay(date, r);
    const cur = days.get(date);
    days.set(date, cur ? mergeDays(cur, day) : day);
  }

  // Duplicate starts keep the latest end; an end before its start is dropped.
  const periods = new Map<string, string | null>();
  for (const p of rawPeriods) {
    const start = normalizeDate(p.startDate);
    if (!start) {
      invalid += 1;
      continue;
    }
    const end = normalizeDate(p.endDate);
    const validEnd = end && end >= start ? end : null;
    const cur = periods.get(start) ?? null;
    periods.set(start, cur && validEnd ? (cur > validEnd ? cur : validEnd) : (cur ?? validEnd));
  }

  const kept = [...days.values()].filter((d) => !isEmpty(d)).sort((a, b) => a.localDate.localeCompare(b.localDate));
  const builtIn = new Set<string>(BUILT_IN_SYMPTOMS);
  return {
    periods: [...periods.entries()].map(([startDate, endDate]) => ({ startDate, endDate })).sort((a, b) => a.startDate.localeCompare(b.startDate)),
    days: kept,
    customSymptoms: [...new Set(kept.flatMap((d) => d.symptoms.map((s) => s.name)).filter((n) => !builtIn.has(n)))],
    invalid,
  };
}

// ---------- JSON backup ----------

export function parseLunaBackup(text: string): LunaImport {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new LunaImportError("unreadable");
  }
  if (!parsed || parsed.format !== "luna-backup" || parsed.version !== 1 || !Array.isArray(parsed.dailyLogs) || !Array.isArray(parsed.cycles)) {
    throw new LunaImportError("notLuna");
  }
  const logs = (parsed.dailyLogs as Record<string, unknown>[]).filter((l) => l && typeof l === "object");
  const cycles = (parsed.cycles as Record<string, unknown>[]).filter((c) => c && typeof c === "object");
  return build(
    [
      ...logs.map((l) => ({ ...l, date: String(l.date ?? "") })),
      ...cycles.map((c) => ({ ...c, date: String(c.startDate ?? ""), fromPeriod: true })),
    ],
    cycles.map((c) => ({ startDate: String(c.startDate ?? ""), endDate: typeof c.endDate === "string" ? c.endDate : null })),
  );
}

// ---------- CSV export ----------

/** RFC 4180 rows: quoted cells may hold commas, quotes ("") and line breaks. */
export function parseCsvTable(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw new LunaImportError("unreadable");
  if (cell || row.length) rows.push([...row, cell]);
  return rows.filter((r) => r.some((v) => v.trim()));
}

/** "Cramps (Moderate) [2 hours]; Headache" */
function csvSymptoms(value: string) {
  return value
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const m = /^(.*?)(?:\s\((Mild|Moderate|Severe)\))?(?:\s\[.+\])?$/.exec(part);
      return { name: (m?.[1] ?? part).trim(), severity: m?.[2] ?? "Mild" };
    });
}

export function parseLunaCsv(text: string): LunaImport {
  const table = parseCsvTable(text.replace(/^﻿/, ""));
  const headers = (table[0] ?? []).map((h) => h.trim());
  const col = (name: string) => headers.indexOf(name);
  const date = col("Date");
  if (date === -1 || table.length < 2) throw new LunaImportError("notLuna");
  const [start, end, flow, symptoms, notes, metrics] = ["Period Start", "Period End", "Flow", "Symptoms", "Notes", "Health Metrics (JSON)"].map(col);
  const cell = (row: string[], i: number) => (i >= 0 ? (row[i] ?? "").trim() : "");
  const yes = (v: string) => ["yes", "true", "1"].includes(v.toLowerCase());

  const records: RawRecord[] = [];
  const starts: string[] = [];
  const ends: string[] = [];
  for (const row of table.slice(1)) {
    const raw = cell(row, date);
    if (!raw) continue;
    let healthMetrics: unknown;
    try {
      healthMetrics = cell(row, metrics) ? JSON.parse(cell(row, metrics)) : undefined;
    } catch {
      healthMetrics = undefined;
    }
    records.push({ date: raw, flow: cell(row, flow), symptoms: csvSymptoms(cell(row, symptoms)), notes: cell(row, notes), healthMetrics });
    const d = normalizeDate(raw);
    if (d && yes(cell(row, start))) starts.push(d);
    if (d && yes(cell(row, end))) ends.push(d);
  }

  const periods = new Map<string, string | null>(starts.map((s) => [s, null]));
  const sortedStarts = [...periods.keys()].sort();
  for (const e of ends.sort()) {
    const s = sortedStarts.filter((x) => x <= e).at(-1);
    if (s && daysBetween(s, e) <= MAX_END_AFTER_START) periods.set(s, e);
  }
  return build(records, [...periods.entries()].map(([startDate, endDate]) => ({ startDate, endDate })));
}

/** A Luna export by its extension: .json backup or .csv daily logs. */
export function parseLunaFile(fileName: string, text: string): LunaImport {
  const ext = fileName.toLowerCase().split(".").pop();
  if (ext === "json") return parseLunaBackup(text);
  if (ext === "csv") return parseLunaCsv(text);
  throw new LunaImportError("notLuna");
}

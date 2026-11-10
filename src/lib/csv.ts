// CSV for data downloads (RFC 4180): fields with commas, quotes or line breaks are quoted,
// rows end in CRLF, and a byte-order mark lets spreadsheet apps read Chinese text as UTF-8.

export type CsvValue = string | number | boolean | Date | null | undefined;

function field(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  const text = value instanceof Date ? value.toISOString() : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(header: string[], rows: CsvValue[][]): string {
  return "﻿" + [header, ...rows].map((row) => row.map(field).join(",")).join("\r\n") + "\r\n";
}

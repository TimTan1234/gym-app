"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ComposedChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Table2 } from "lucide-react";
import { formatLocalDate } from "@/lib/dates";

const AXIS = { fontSize: 11, fill: "var(--steel)" };
const shortDate = (d: string) => formatLocalDate(d, { weekday: undefined });

function fmt(v: number | null | undefined, decimals: number) {
  return v === null || v === undefined || Number.isNaN(v) ? "–" : v.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

type TooltipRow = { label: string; value: string; color?: string };

function TooltipBox({ title, rows }: { title: string; rows: TooltipRow[] }) {
  return (
    <div className="rounded-[10px] border border-line bg-paper px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="num flex items-center gap-1.5 text-steel">
          {r.color && <span className="inline-block size-2 rounded-full" style={{ background: r.color }} />}
          {r.label}: <span className="font-semibold text-iron">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

function TableToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} aria-pressed={open} className="flex items-center gap-1 text-xs text-steel hover:text-iron">
      <Table2 className="size-3.5" /> {open ? "Chart" : "Table"}
    </button>
  );
}

function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="max-h-64 overflow-y-auto">
      <table className="num w-full text-left text-xs">
        <thead className="sticky top-0 bg-paper text-steel">
          <tr>{head.map((h) => <th key={h} className="py-1 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line">
              {r.map((c, j) => <td key={j} className="py-1">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface TrendPoint {
  date: string;
  value: number | null;
  avg?: number | null;
}

/**
 * Change over time for one measure. Optional `avg` series (e.g. 7-day moving
 * average) is drawn as the line, with raw values as dots.
 */
export function TrendChart({
  title,
  data,
  unit,
  decimals = 1,
  target,
  height = 200,
}: {
  title: string;
  data: TrendPoint[];
  unit: string;
  decimals?: number;
  target?: number;
  height?: number;
}) {
  const [table, setTable] = useState(false);
  const hasAvg = data.some((d) => d.avg !== undefined && d.avg !== null);
  // A flat series (e.g. weight within 1 kg) needs a decimal on the axis or every tick reads the same.
  const values = data.flatMap((d) => [d.value, d.avg ?? d.value]).filter((v): v is number => v !== null);
  const axisDecimals = values.length > 0 && Math.max(...values) - Math.min(...values) < 5 ? 1 : 0;

  return (
    <figure className="space-y-2">
      <figcaption className="flex items-center justify-between">
        <span className="text-sm font-semibold">{title}</span>
        <span className="flex items-center gap-3">
          {target !== undefined && <TargetKey value={target} unit={unit} />}
          {hasAvg && (
            <span className="flex items-center gap-3 text-xs text-steel">
              <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-full bg-steel opacity-40" /> Daily</span>
              <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-3 bg-steel" /> 7-day avg</span>
            </span>
          )}
          <TableToggle open={table} onToggle={() => setTable((t) => !t)} />
        </span>
      </figcaption>
      {table ? (
        <DataTable
          head={hasAvg ? ["Date", `Value (${unit})`, `7-day avg (${unit})`] : ["Date", `Value (${unit})`]}
          rows={[...data].reverse().map((d) => (hasAvg ? [shortDate(d.date), fmt(d.value, decimals), fmt(d.avg, decimals)] : [shortDate(d.date), fmt(d.value, decimals)]))}
        />
      ) : (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} domain={["auto", "auto"]} width={48} tickFormatter={(v: number) => fmt(v, axisDecimals)} />
              {target !== undefined && (
                <ReferenceLine y={target} stroke="var(--steel)" strokeDasharray="4 4" />
              )}
              <Tooltip
                cursor={{ stroke: "var(--steel)", strokeWidth: 1 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as TrendPoint;
                  const rows: TooltipRow[] = [{ label: hasAvg ? "Daily" : title, value: `${fmt(p.value, decimals)} ${unit}`, color: "var(--steel)" }];
                  if (hasAvg) rows.push({ label: "7-day avg", value: `${fmt(p.avg, decimals)} ${unit}`, color: "var(--steel)" });
                  return <TooltipBox title={formatLocalDate(String(label))} rows={rows} />;
                }}
              />
              {hasAvg ? (
                <>
                  <Scatter dataKey="value" fill="var(--steel)" fillOpacity={0.35} isAnimationActive={false} />
                  <Line dataKey="avg" stroke="var(--steel)" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                </>
              ) : (
                <Line
                  dataKey="value"
                  stroke="var(--steel)"
                  strokeWidth={2}
                  dot={{ r: 4, fill: "var(--steel)", stroke: "var(--paper)", strokeWidth: 2 }}
                  activeDot={{ r: 5 }}
                  connectNulls
                  isAnimationActive={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </figure>
  );
}

/** Legend entry for the dashed target line; the line itself stays unlabelled so bars never cover the label. */
function TargetKey({ value, unit }: { value: number; unit: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-steel">
      <span aria-hidden className="inline-block w-3 border-t border-dashed border-steel" />
      Target {fmt(value, 0)} {unit}
    </span>
  );
}

/** Daily values vs a target (e.g. kcal or protein per day). */
export function DailyBars({
  title,
  data,
  unit,
  target,
  color = "var(--steel)",
  height = 180,
}: {
  title: string;
  data: { date: string; value: number }[];
  unit: string;
  target?: number;
  color?: string;
  height?: number;
}) {
  const [table, setTable] = useState(false);
  return (
    <figure className="space-y-2">
      <figcaption className="flex items-center justify-between">
        <span className="text-sm font-semibold">{title}</span>
        <span className="flex items-center gap-3">
          {target !== undefined && <TargetKey value={target} unit={unit} />}
          <TableToggle open={table} onToggle={() => setTable((t) => !t)} />
        </span>
      </figcaption>
      {table ? (
        <DataTable
          head={["Date", `${title} (${unit})`, ...(target ? ["Target"] : [])]}
          rows={[...data].reverse().map((d) => [shortDate(d.date), fmt(d.value, 0), ...(target ? [fmt(target, 0)] : [])])}
        />
      ) : (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} barCategoryGap={2}>
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => fmt(v, 0)} />
              {target !== undefined && (
                <ReferenceLine y={target} stroke="var(--steel)" strokeDasharray="4 4" />
              )}
              <Tooltip
                cursor={{ fill: "var(--wash)" }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const v = Number(payload[0].value);
                  const rows: TooltipRow[] = [{ label: title, value: `${fmt(v, 0)} ${unit}`, color }];
                  if (target) rows.push({ label: "Target", value: `${fmt(target, 0)} ${unit}` });
                  return <TooltipBox title={formatLocalDate(String(label))} rows={rows} />;
                }}
              />
              <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </figure>
  );
}

/** Magnitude by category, sorted (e.g. weekly sets per muscle). */
export function CategoryBars({
  title,
  data,
  unit,
  height,
}: {
  title: string;
  data: { label: string; value: number }[];
  unit: string;
  height?: number;
}) {
  const [table, setTable] = useState(false);
  const h = height ?? Math.max(120, data.length * 30 + 20);
  return (
    <figure className="space-y-2">
      <figcaption className="flex items-center justify-between">
        <span className="text-sm font-semibold">{title}</span>
        <TableToggle open={table} onToggle={() => setTable((t) => !t)} />
      </figcaption>
      {table ? (
        <DataTable head={["Category", unit]} rows={data.map((d) => [d.label, fmt(d.value, 0)])} />
      ) : (
        <div style={{ height: h }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 0, right: 32, bottom: 0, left: 0 }} barCategoryGap={4}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="label" tick={AXIS} tickLine={false} axisLine={false} width={88} />
              <Tooltip
                cursor={{ fill: "var(--wash)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as { label: string; value: number };
                  return <TooltipBox title={d.label} rows={[{ label: title, value: `${fmt(d.value, 0)} ${unit}`, color: "var(--steel)" }]} />;
                }}
              />
              <Bar
                dataKey="value"
                fill="var(--steel)"
                radius={[0, 4, 4, 0]}
                maxBarSize={20}
                isAnimationActive={false}
                label={{ position: "right", fontSize: 11, fill: "var(--steel)" }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </figure>
  );
}


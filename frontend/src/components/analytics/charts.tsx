"use client";

import { BarChart3, Table2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
  type TooltipContentProps,
} from "recharts";

// Chart conventions (dataviz method): one stone hue for single series; the validated cool/warm pair for
// polarity; recessive grid; 4px data-end radius; tooltip on every mark; a table view for every chart.
export const VIZ = { one: "var(--viz-1)", cool: "var(--viz-cool)", warm: "var(--viz-warm)", grid: "var(--viz-grid)" };
const AXIS = { fill: "var(--fg-3)", fontSize: 11, fontFamily: "var(--font-sans)" };

export type Col<T> = { key: keyof T & string; label: string; numeric?: boolean; format?: (v: T[keyof T]) => ReactNode };

export function ChartFrame<T extends object>({
  title,
  caption,
  legend,
  rows,
  cols,
  children,
}: {
  title: string;
  caption?: ReactNode;
  legend?: { label: string; color: string }[];
  rows: T[];
  cols: Col<T>[];
  children: ReactNode;
}) {
  const [table, setTable] = useState(false);
  const dataTable = (
    <table className="data-table text-xs">
      <caption className="sr-only">{title}</caption>
      <thead className="sticky top-0 bg-canvas">
        <tr>{cols.map((c) => <th key={c.key} scope="col" className={c.numeric ? "!text-right" : ""}>{c.label}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {cols.map((c) => (
              <td key={c.key} className={c.numeric ? "text-right font-mono tabular" : ""}>
                {c.format ? c.format(r[c.key]) : String(r[c.key] ?? "")}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <figure className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h3 className="text-sm font-bold">{title}</h3>
        {legend ? (
          <ul className="flex gap-3 text-2xs text-fg-2" aria-label="Legend">
            {legend.map((l) => (
              <li key={l.label} className="flex items-center gap-1.5">
                <span aria-hidden className="size-2.5 rounded-[2px]" style={{ background: l.color }} /> {l.label}
              </li>
            ))}
          </ul>
        ) : null}
        <div role="group" aria-label={`${title} view`} className="ml-auto inline-flex rounded-md border border-line p-0.5">
          <button type="button" aria-pressed={!table} onClick={() => setTable(false)} className={`inline-flex h-6 items-center gap-1 rounded-sm px-2 text-2xs font-semibold ${!table ? "bg-raised text-fg" : "text-fg-2 hover:text-fg"}`}>
            <BarChart3 className="size-3" aria-hidden /> Chart
          </button>
          <button type="button" aria-pressed={table} onClick={() => setTable(true)} className={`inline-flex h-6 items-center gap-1 rounded-sm px-2 text-2xs font-semibold ${table ? "bg-raised text-fg" : "text-fg-2 hover:text-fg"}`}>
            <Table2 className="size-3" aria-hidden /> Table
          </button>
        </div>
      </div>
      {table ? (
        <div className="max-h-[22rem] overflow-auto rounded-md border border-line">{dataTable}</div>
      ) : (
        <>
          <div aria-hidden>{children}</div>
          <div className="sr-only">{dataTable}</div>
        </>
      )}
      {caption ? <figcaption className="mt-2 text-2xs text-fg-3">{caption}</figcaption> : null}
    </figure>
  );
}

function Tip({ active, payload, label, unit, format }: TooltipContentProps<number, string>
  & { unit?: (name: string) => string; format?: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-[#474545] bg-raised px-2.5 py-2 text-2xs shadow-[0_8px_24px_-6px_rgb(0_0_0/0.6)]">
      <p className="mb-1 font-semibold text-fg">{label}</p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="flex items-center gap-2 text-fg-2">
          <span aria-hidden className="size-2 rounded-[2px]" style={{ background: p.color ?? p.payload?.fill }} />
          <span>{p.name}</span>
          <span className="ml-auto pl-3 font-mono text-fg tabular">{format ? format(Number(p.value)) : Math.abs(Number(p.value)).toLocaleString()}{unit ? ` ${unit(String(p.name))}` : ""}</span>
        </p>
      ))}
    </div>
  );
}

/** Vertical columns over an ordered x (days, hours). */
export function Columns<T extends object>({ data, x, y, name, height = 220 }: { data: T[]; x: keyof T & string; y: keyof T & string; name: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -18 }} barCategoryGap={2}>
        <CartesianGrid vertical={false} stroke={VIZ.grid} />
        <XAxis dataKey={x as string} tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--line)" }} minTickGap={16} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip cursor={{ fill: "rgb(147 138 135 / 0.1)" }} content={(p) => <Tip {...(p as TooltipContentProps<number, string>)} />} />
        <Bar dataKey={y as string} name={name} fill={VIZ.one} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Additions above the baseline, deletions below: polarity on one axis. */
export function Churn<T extends { additions: number; deletions: number }>({ data, x, height = 200 }: { data: T[]; x: keyof T & string; height?: number }) {
  const rows = data.map((d) => ({ ...d, _del: -d.deletions }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: -10 }} stackOffset="sign" barCategoryGap={2}>
        <CartesianGrid vertical={false} stroke={VIZ.grid} />
        <XAxis dataKey={x as string} tick={AXIS} tickLine={false} axisLine={false} minTickGap={16} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v: number) => Math.abs(v).toLocaleString()} />
        <ReferenceLine y={0} stroke="var(--stone-2)" />
        <Tooltip cursor={{ fill: "rgb(147 138 135 / 0.1)" }} content={(p) => <Tip {...(p as TooltipContentProps<number, string>)} unit={() => "lines"} />} />
        <Bar dataKey="additions" name="Additions" stackId="c" fill={VIZ.cool} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
        <Bar dataKey="_del" name="Deletions" stackId="c" fill={VIZ.warm} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Ranked horizontal bars (terms, authors, extensions). */
export function Ranked<T extends object>({ data, label, value, name }: { data: T[]; label: keyof T & string; value: keyof T & string; name: string }) {
  const height = Math.max(120, data.length * 26 + 16);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 0 }} barCategoryGap={4}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey={label as string} tick={{ ...AXIS, fill: "var(--fg-2)", fontSize: 12 }} tickLine={false} axisLine={false} width={120} interval={0} />
        <Tooltip cursor={{ fill: "rgb(147 138 135 / 0.1)" }} content={(p) => <Tip {...(p as TooltipContentProps<number, string>)} />} />
        <Bar dataKey={value as string} name={name} fill={VIZ.one} radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false}
          label={{ position: "right", fill: "var(--fg-3)", fontSize: 11, formatter: (v: unknown) => Number(v).toLocaleString() }} />
      </BarChart>
    </ResponsiveContainer>
  );
}


/** Several counts per x, stacked so the column height reads as the total. */
export function StackedColumns<T extends object>({ data, x, series, height = 220 }: {
  data: T[];
  x: keyof T & string;
  series: { key: keyof T & string; label: string; color: string }[];
  height?: number;
}) {
  const last = series.length - 1;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -18 }} barCategoryGap={2}>
        <CartesianGrid vertical={false} stroke={VIZ.grid} />
        <XAxis dataKey={x as string} tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--line)" }} minTickGap={16} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip cursor={{ fill: "rgb(147 138 135 / 0.1)" }} content={(p) => <Tip {...(p as TooltipContentProps<number, string>)} />} />
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key as string} name={s.label} stackId="a" fill={s.color} maxBarSize={36}
            radius={i === last ? [4, 4, 0, 0] : undefined} isAnimationActive={false} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}


/**
 * Shares over time, stacked into one full band, with each series' latest share called out at the
 * right edge - the shape Steam's hardware survey uses.
 *
 * Two or more rows make a band that moves. A caller with a single measurement passes it twice and
 * gets the flat band that measurement is - duplicates are kept as separate points, so the shape
 * spans the width without claiming a slope. `series` is drawn bottom-up, so pass it largest first
 * and the biggest band sits on the floor.
 */
export function ShareArea({ data, x, series, height = 190 }: {
  data: Record<string, string | number>[];
  x: string;
  series: { key: string; label: string; color: string }[];
  height?: number;
}) {
  const last = data[data.length - 1] ?? {};
  // Each label sits at the middle of its own band. The first sits on the floor and every later one
  // is nudged up until it clears the one below by 14px, because a 1% band is thinner than the text
  // naming it - Steam's chart crowds the same way.
  const marks = series.reduce<{ key: string; color: string; share: number; top: number }[]>((acc, s) => {
    const share = Number(last[s.key] ?? 0);
    const below = acc.reduce((n, m) => n + m.share, 0);
    const middle = (1 - (below + share / 2)) * height;
    const prev = acc[acc.length - 1];
    acc.push({ key: s.key, color: s.color, share, top: prev ? Math.min(middle, prev.top - 14) : middle });
    return acc;
  }, []);

  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
            <XAxis dataKey={x} hide />
            <YAxis domain={[0, 1]} hide />
            <Tooltip content={(p) => <Tip {...(p as TooltipContentProps<number, string>)} format={(v) => `${(v * 100).toFixed(1)}%`} />} />
            {series.map((s) => (
              <Area key={s.key} dataKey={s.key} name={s.label} stackId="a" type="linear"
                stroke={s.color} fill={s.color} fillOpacity={1} strokeWidth={0} isAnimationActive={false} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="relative w-12 flex-none" style={{ height }} aria-hidden>
        {marks.filter((m) => m.share > 0).map((m) => (
          <span key={m.key} className="absolute right-0 font-mono text-2xs tabular"
            style={{ top: Math.max(0, m.top), transform: "translateY(-50%)", color: m.color }}>
            {(m.share * 100).toFixed(2)}%
          </span>
        ))}
      </div>
    </div>
  );
}

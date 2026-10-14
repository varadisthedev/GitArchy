"use client";

import { BarChart3, Table2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
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

function Tip({ active, payload, label, unit }: TooltipContentProps<number, string> & { unit?: (name: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-[#474545] bg-raised px-2.5 py-2 text-2xs shadow-[0_8px_24px_-6px_rgb(0_0_0/0.6)]">
      <p className="mb-1 font-semibold text-fg">{label}</p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="flex items-center gap-2 text-fg-2">
          <span aria-hidden className="size-2 rounded-[2px]" style={{ background: p.color ?? p.payload?.fill }} />
          <span>{p.name}</span>
          <span className="ml-auto pl-3 font-mono text-fg tabular">{Math.abs(Number(p.value)).toLocaleString()}{unit ? ` ${unit(String(p.name))}` : ""}</span>
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

/** Signed horizontal bars (model coefficients): cool for positive, warm for negative, labels carry the sign. */
export function Signed({ data }: { data: { feature: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, data.length * 30 + 16)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 48, bottom: 0, left: 0 }}>
        <XAxis type="number" hide domain={["dataMin", "dataMax"]} />
        <YAxis type="category" dataKey="feature" tick={{ ...AXIS, fill: "var(--fg-2)", fontSize: 12, fontFamily: "var(--font-mono)" }} tickLine={false} axisLine={false} width={110} interval={0} />
        <ReferenceLine x={0} stroke="var(--stone-2)" />
        <Tooltip cursor={{ fill: "rgb(147 138 135 / 0.1)" }} content={({ active, payload }) =>
          active && payload?.[0] ? (
            <div className="rounded-md border border-[#474545] bg-raised px-2.5 py-2 text-2xs">
              <span className="font-mono text-fg">{String(payload[0].payload.feature)}</span>{" "}
              <span className="font-mono text-fg-2">{Number(payload[0].value) >= 0 ? "+" : ""}{Number(payload[0].value).toFixed(4)}</span>
            </div>
          ) : null
        } />
        <Bar dataKey="value" name="Coefficient" radius={4} maxBarSize={18} isAnimationActive={false}
          label={{ position: "right", fill: "var(--fg-3)", fontSize: 11, formatter: (v: unknown) => `${Number(v) >= 0 ? "+" : ""}${Number(v).toFixed(3)}` }}>
          {data.map((d) => <Cell key={d.feature} fill={d.value >= 0 ? VIZ.cool : VIZ.warm} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

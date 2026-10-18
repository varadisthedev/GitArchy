"use client";

import { useMemo } from "react";
import type { ActivityEvent } from "@/lib/api/types";
import { ChartFrame, StackedColumns, VIZ } from "@/components/analytics/charts";

const MONTHS = 12;
const monthLabel = new Intl.DateTimeFormat(undefined, { month: "short" });
const monthFull = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });

export type MonthRow = { month: string; full: string; commits: number; branches: number; repos: number; total: number };

/** Which metric an event counts towards, or null for events the chart doesn't measure. */
function metric(type: string): "commits" | "branches" | "repos" | null {
  if (type === "commit.created") return "commits";
  if (type === "branch.created") return "branches";
  if (type === "repo.created" || type === "repo.imported" || type === "repo.restored") return "repos";
  return null;
}

export const SERIES = [
  { key: "commits", label: "Commits", one: "commit", color: VIZ.one },
  { key: "branches", label: "Branches", one: "branch", color: VIZ.cool },
  { key: "repos", label: "Repositories", one: "repository", color: VIZ.warm },
] as const;

/**
 * Commits, branches and new repositories per calendar month, over a continuous range ending this month.
 *
 * Months with no activity are kept at zero: dropping them would squash the gaps and make a quiet
 * stretch read as a busy one. The range is capped at 12 so a short `month` label is unambiguous.
 */
export function monthlyActivity(events: ActivityEvent[], months = MONTHS): MonthRow[] {
  const counts = new Map<string, { commits: number; branches: number; repos: number }>();
  for (const e of events) {
    const m = metric(e.type);
    if (!m) continue;
    const d = new Date(e.ts);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const row = counts.get(key) ?? { commits: 0, branches: 0, repos: 0 };
    row[m] += 1;
    counts.set(key, row);
  }
  const now = new Date();
  const rows: MonthRow[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const c = counts.get(`${d.getFullYear()}-${d.getMonth()}`) ?? { commits: 0, branches: 0, repos: 0 };
    rows.push({
      month: monthLabel.format(d),
      full: monthFull.format(d),
      ...c,
      total: c.commits + c.branches + c.repos,
    });
  }
  return rows;
}

const num = (v: unknown) => Number(v).toLocaleString();

export function CommitActivityChart({ events, capped }: { events: ActivityEvent[]; capped: boolean }) {
  const rows = useMemo(() => monthlyActivity(events), [events]);
  const sum = (k: "commits" | "branches" | "repos") => rows.reduce((n, r) => n + r[k], 0);
  const parts = SERIES.map((s) => ({ ...s, n: sum(s.key) })).filter((s) => s.n > 0);

  return (
    <ChartFrame
      title="Activity by month"
      legend={SERIES.map((s) => ({ label: s.label, color: s.color }))}
      caption={
        parts.length === 0
          ? "No commits, branches or new repositories in the last 12 months."
          : parts.map((s) => `${s.n.toLocaleString()} ${s.n === 1 ? s.one : s.label.toLowerCase()}`).join(", ") +
            " over the last 12 months" +
            (capped ? ", counted from your latest 100 events — older history isn't included." : ".")
      }
      rows={rows}
      cols={[
        { key: "full", label: "Month" },
        { key: "commits", label: "Commits", numeric: true, format: num },
        { key: "branches", label: "Branches", numeric: true, format: num },
        { key: "repos", label: "Repositories", numeric: true, format: num },
        { key: "total", label: "Total", numeric: true, format: num },
      ]}
    >
      <StackedColumns data={rows} x="month" series={[...SERIES]} height={168} />
    </ChartFrame>
  );
}

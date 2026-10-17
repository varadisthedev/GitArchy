"use client";

import { useMemo } from "react";
import type { ActivityEvent } from "@/lib/api/types";
import { ChartFrame, Columns } from "@/components/analytics/charts";

const MONTHS = 12;
const monthLabel = new Intl.DateTimeFormat(undefined, { month: "short" });
const monthFull = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });

export type MonthRow = { month: string; full: string; commits: number };

/**
 * Commits per calendar month, over a continuous range ending this month.
 *
 * Months with no commits are kept at zero: dropping them would squash the gaps and make a quiet
 * stretch read as a busy one. The range is capped at 12 so a short `month` label is unambiguous.
 */
export function monthlyCommits(events: ActivityEvent[], months = MONTHS): MonthRow[] {
  const counts = new Map<string, number>();
  for (const e of events) {
    if (e.type !== "commit.created") continue;
    const d = new Date(e.ts);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const now = new Date();
  const rows: MonthRow[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    rows.push({
      month: monthLabel.format(d),
      full: monthFull.format(d),
      commits: counts.get(`${d.getFullYear()}-${d.getMonth()}`) ?? 0,
    });
  }
  return rows;
}

export function CommitActivityChart({ events, capped }: { events: ActivityEvent[]; capped: boolean }) {
  const rows = useMemo(() => monthlyCommits(events), [events]);
  const total = rows.reduce((n, r) => n + r.commits, 0);

  return (
    <ChartFrame
      title="Commits by month"
      caption={
        total === 0
          ? "No commits in the last 12 months."
          : `${total.toLocaleString()} ${total === 1 ? "commit" : "commits"} over the last 12 months` +
            (capped ? ", counted from your latest 100 events — older history isn't included." : ".")
      }
      rows={rows}
      cols={[
        { key: "full", label: "Month" },
        { key: "commits", label: "Commits", numeric: true, format: (v) => Number(v).toLocaleString() },
      ]}
    >
      <Columns data={rows} x="month" y="commits" name="Commits" height={168} />
    </ChartFrame>
  );
}

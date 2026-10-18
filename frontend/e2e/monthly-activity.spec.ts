import { expect, test } from "@playwright/test";
import { monthlyActivity } from "../src/components/activity/commit-chart";
import type { ActivityEvent } from "../src/lib/api/types";

// Pure logic: no page, no backend. Guards the month bucketing the activity chart is drawn from.
const ev = (type: string, ts: string): ActivityEvent =>
  ({ id: ts + type, type, actor_id: "u", repo_id: "r", data: {}, ts });

const iso = (monthsAgo: number) => {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth() - monthsAgo, 15, 12).toISOString();
};

test("monthlyActivity counts each metric per month and keeps quiet months at zero", () => {
  const rows = monthlyActivity([
    ev("commit.created", iso(0)),
    ev("commit.created", iso(0)),
    ev("branch.created", iso(0)),
    ev("repo.imported", iso(1)),
    ev("repo.created", iso(1)),
    ev("repo.updated", iso(1)), // not a charted metric
    ev("member.set", iso(1)),
    ev("commit.created", iso(99)), // outside the window
    ev("commit.created", "not a date"),
  ]);

  expect(rows).toHaveLength(12);
  expect(rows[11]).toMatchObject({ commits: 2, branches: 1, repos: 0, total: 3 });
  expect(rows[10]).toMatchObject({ commits: 0, branches: 0, repos: 2, total: 2 });
  expect(rows.slice(0, 10).every((r) => r.total === 0)).toBe(true);
});

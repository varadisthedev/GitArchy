import { expect, test } from "@playwright/test";
import { toSeries } from "../src/app/(app)/survey/platform-survey";
import type { SurveyResult, SurveyRun } from "../src/lib/api/types";

const g = (label: string, share: number) => ({ label, share, count: Math.round(share * 100) });
const run = (measured_at: string, languages: { label: string; share: number; count: number }[]): SurveyRun => ({
  measured_at,
  result: { accounts: 1, repos: 1, files: 1, commits: 1, languages, visibility: [], message_lengths: [] } as SurveyResult,
});
const langs = (r: SurveyResult) => r.languages;

test("toSeries orders the stack by the newest run, so the biggest band sits on the floor", () => {
  const { series } = toSeries([
    run("2026-01-01T00:00:00Z", [g("Python", 0.8), g("Go", 0.2)]),
    run("2026-02-01T00:00:00Z", [g("Go", 0.7), g("Python", 0.3)]),
  ], langs);
  expect(series.map((s) => s.key)).toEqual(["Go", "Python"]);
});

test("toSeries keeps a label that has since vanished, so every band still sums to the whole", () => {
  const { data, series } = toSeries([
    run("2026-01-01T00:00:00Z", [g("Perl", 0.5), g("Python", 0.5)]),
    run("2026-02-01T00:00:00Z", [g("Python", 1)]),
  ], langs);
  expect(series.map((s) => s.key)).toEqual(["Python", "Perl"]);
  expect(data[1].Perl).toBe(0);  // gone, not missing: a hole here would dent the stack
  for (const row of data) {
    expect(series.reduce((n, s) => n + Number(row[s.key]), 0)).toBeCloseTo(1);
  }
});

test("toSeries labels each row with when it was measured", () => {
  const { data } = toSeries([run("2026-01-01T00:00:00Z", [g("Python", 1)]),
                             run("2026-02-01T00:00:00Z", [g("Python", 1)])], langs);
  expect(data).toHaveLength(2);
  expect(typeof data[0]._t).toBe("string");
  expect(data[0]._t).not.toBe(data[1]._t);
});

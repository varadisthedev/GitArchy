"use client";

import { Globe2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useSubmitJob, useSurvey } from "@/lib/api/queries";
import type { SurveyGroup, SurveyResult, SurveyRun } from "@/lib/api/types";
import { fullDate, plural, relTime } from "@/lib/format";
import { ChartFrame, ShareArea } from "@/components/analytics/charts";
import { colorFor } from "@/components/analytics/language-bar";
import { EmptyState, ErrorState, PageHeader, SkeletonRows } from "@/components/ui/states";

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

type Pick = (r: SurveyResult) => SurveyGroup[];

/**
 * The history as one stacked band per label, oldest run on the left.
 *
 * Labels are taken from every run, not just the newest, so a language that has since dropped out
 * still holds its place on the left and the band keeps summing to the whole. They are ordered by
 * their share in the newest run, which puts the biggest on the floor of the stack.
 */
export function toSeries(history: SurveyRun[], pick: Pick) {
  const latest = new Map(pick(history[history.length - 1].result).map((g) => [g.label, g.share]));
  const labels = [...new Set(history.flatMap((h) => pick(h.result).map((g) => g.label)))]
    .sort((a, b) => (latest.get(b) ?? 0) - (latest.get(a) ?? 0));
  const data = history.map((h) => {
    const by = new Map(pick(h.result).map((g) => [g.label, g.share]));
    return Object.fromEntries([["_t", fullDate(h.measured_at)],
      ...labels.map((l) => [l, by.get(l) ?? 0])]) as Record<string, string | number>;
  });
  return { data, series: labels.map((l) => ({ key: l, label: l, color: colorFor(l) })) };
}

/**
 * One metric in the shape Steam's hardware survey uses: shares stacked into a full band, each
 * series' latest value called out at the right edge.
 *
 * A survey is a snapshot - nobody recorded what these repositories looked like six months ago - so
 * the series is of measurements taken, not of months passed, and the first run has nothing to
 * stretch across. Until there are two, the same shares are drawn as the single bar they are.
 */
function SurveyPanel({ title, caption, history, pick }: {
  title: string; caption: string; history: SurveyRun[]; pick: Pick;
}) {
  const groups = pick(history[history.length - 1].result);
  const shown = groups.filter((g) => g.count > 0);
  const trend = history.length > 1 ? toSeries(history, pick) : null;
  const range = trend
    ? ` Measured ${history.length} times, ${fullDate(history[0].measured_at)} to ${fullDate(history[history.length - 1].measured_at)}.`
    : " One measurement so far — run the survey again and this becomes a trend.";
  return (
    <ChartFrame
      title={title}
      caption={caption + range}
      rows={groups}
      cols={[
        { key: "label", label: "Group" },
        { key: "count", label: "Count", numeric: true, format: (v) => Number(v).toLocaleString() },
        { key: "share", label: "Share", numeric: true, format: (v) => pct(Number(v)) },
      ]}
    >
      {trend ? (
        <ShareArea data={trend.data} x="_t" series={trend.series} />
      ) : (
        <div className="flex h-7 w-full gap-[2px] overflow-hidden rounded-md bg-surface">
          {shown.map((g) => (
            <span
              key={g.label}
              className="h-full first:rounded-l-md last:rounded-r-md"
              style={{ width: `${g.share * 100}%`, backgroundColor: colorFor(g.label) }}
              title={`${g.label} · ${pct(g.share)} · ${g.count.toLocaleString()}`}
            />
          ))}
        </div>
      )}
      <ul className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {shown.map((g) => (
          <li key={g.label} className="flex items-baseline gap-2 text-xs">
            <span className="size-2.5 flex-none translate-y-[1px] rounded-[2px]" style={{ backgroundColor: colorFor(g.label) }} aria-hidden />
            <span className="min-w-0 truncate font-semibold text-fg">{g.label}</span>
            <span className="ml-auto font-mono tabular text-fg-2">{pct(g.share)}</span>
            <span className="w-14 text-right font-mono tabular text-2xs text-fg-3">{g.count.toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </ChartFrame>
  );
}

export function PlatformSurvey() {
  const survey = useSurvey();
  const submit = useSubmitJob();
  const [started, setStarted] = useState(false);
  const data = survey.data;
  const r = data?.result ?? null;
  // a result cached before histories were kept still charts, as the one run it is
  const history: SurveyRun[] = data?.history?.length
    ? data.history
    : r && data?.measured_at ? [{ measured_at: data.measured_at, result: r }] : [];

  const refresh = () => {
    setStarted(true);
    submit.mutate({ task_type: "platform_survey", params: {}, job_id: crypto.randomUUID() });
  };

  return (
    <div className="mx-auto max-w-[78rem]">
      <PageHeader
        title="Platform survey"
        description="What every Gitarchy account with GitHub connected is actually building, counted together."
        actions={
          data?.worker_available ? (
            <button type="button" className="btn" onClick={refresh} disabled={submit.isPending || started}>
              <RefreshCw className={`size-4 ${submit.isPending ? "animate-spin" : ""}`} aria-hidden />
              {started ? "Running…" : "Run survey"}
            </button>
          ) : (
            <p className="text-xs text-fg-3">No Spark worker connected — showing the last run.</p>
          )
        }
      />

      {survey.isPending ? <SkeletonRows rows={5} label="Loading survey" /> : null}
      {survey.isError ? <ErrorState error={survey.error} retry={() => survey.refetch()} /> : null}
      {survey.isSuccess && !r ? (
        <EmptyState icon={<Globe2 />} title="No survey has been run yet">
          {data?.worker_available
            ? "Start one with the button above — it reads every repository on the platform at once."
            : "This needs a Spark worker. Start the Colab notebook, then run the survey."}
        </EmptyState>
      ) : null}

      {r ? (
        <>
          <dl className="mb-10 flex flex-wrap gap-x-10 gap-y-4 border-b border-line pb-6">
            {([
              ["Accounts", r.accounts],
              ["Repositories", r.repos],
              ["Files", r.files],
              ["Commits", r.commits],
            ] as const).map(([k, v]) => (
              <div key={k}>
                <dt className="text-2xs text-fg-3">{k}</dt>
                <dd className="font-mono text-xl font-semibold tabular">{v.toLocaleString()}</dd>
              </div>
            ))}
            {data?.measured_at ? (
              <div className="ml-auto self-end">
                <dt className="sr-only">Measured</dt>
                <dd className="text-xs text-fg-3" title={fullDate(data.measured_at)}>
                  measured {relTime(data.measured_at)}
                </dd>
              </div>
            ) : null}
          </dl>

          <div className="grid gap-x-12 gap-y-10 lg:grid-cols-2">
            <div className="lg:col-span-2">
              <SurveyPanel
                title="Most popular languages"
                caption={`Counted by how many of the ${plural(r.files, "file")} carry each extension, not by weight — so a one-line stylesheet counts the same as a trained model.`}
                history={history}
                pick={(x) => x.languages}
              />
            </div>
            <SurveyPanel
              title="Public or private"
              caption={`Across ${plural(r.repos, "repository", "repositories")}. Counted blind: the survey never records which account owns which repository.`}
              history={history}
              pick={(x) => x.visibility}
            />
            <SurveyPanel
              title="Commit message length"
              caption={`Subject line only, over ${plural(r.commits, "commit")} — a body is not measured. Git convention asks for 50 characters and hard-wraps at 72.`}
              history={history}
              pick={(x) => x.message_lengths}
            />
          </div>

          <p className="mt-10 max-w-[70ch] text-xs text-fg-3">
            Aggregate figures only. No username, repository name or owner is recorded in this result, which is what
            lets a private repository be counted without disclosing that it exists — and until five accounts have
            connected, too few to hide among, only public repositories are surveyed at all.
          </p>
        </>
      ) : null}
    </div>
  );
}

"use client";

import { ArrowLeft, Ban, RotateCcw } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { useCancelJob, useJob, useJobResults, useRepos, useSubmitJob } from "@/lib/api/queries";
import { ACTIVE_STATUSES, taskMeta } from "@/lib/analytics";
import { fullDate, seconds } from "@/lib/format";
import { useJobStream } from "@/lib/use-job-stream";
import { JobLifecycle } from "@/components/analytics/job-lifecycle";
import { WorkerStatus } from "@/components/analytics/worker-status";
import { JobStatusChip } from "@/components/ui/bits";
import { ErrorState, InlineError, Skeleton, Spinner } from "@/components/ui/states";

// recharts only loads when there is a result to draw
const JobResultView = dynamic(() => import("@/components/analytics/job-results"), {
  loading: () => <Skeleton className="h-72" />,
});

export function JobDetail({ id }: { id: string }) {
  const router = useRouter();
  const repos = useRepos();
  const first = useJob(id);
  const active = !!first.data && ACTIVE_STATUSES.has(first.data.status);
  const { progress, stream } = useJobStream(id, first.data?.status);
  // fall back to polling whenever the live stream isn't delivering
  const job = useJob(id, active && stream !== "live" ? 5000 : false).data ?? first.data;
  const results = useJobResults(id, job?.status === "succeeded");
  const cancel = useCancelJob();
  const resubmit = useSubmitJob();
  const name = useMemo(() => {
    const m = new Map((repos.data ?? []).map((r) => [r.id, r.name]));
    return (rid: string) => m.get(rid);
  }, [repos.data]);

  if (first.isError) return <ErrorState error={first.error} retry={() => first.refetch()} />;
  if (!job) return <Skeleton className="h-96" />;
  const meta = taskMeta(job.task_type);
  const waiting = job.status === "queued" && job.status_detail === "worker_unavailable";

  async function rerun() {
    if (!job || resubmit.isPending) return;
    try {
      const j = await resubmit.mutateAsync({ task_type: job.task_type, params: job.params, repo_ids: job.repo_ids, job_id: crypto.randomUUID() });
      router.push(`/analytics/jobs/${j.id}`);
    } catch {} // shown inline via resubmit.error
  }

  return (
    <div className="mx-auto max-w-[78rem]">
      <Link href="/analytics" className="inline-flex items-center gap-1 text-xs font-semibold text-fg-2 hover:text-fg">
        <ArrowLeft className="size-3.5" aria-hidden /> Analytics
      </Link>

      <header className="mt-3 mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-[-0.02em]">{meta?.title ?? job.task_type}</h1>
            <JobStatusChip status={job.status} waiting={waiting} />
          </div>
          <p className="mt-1 text-sm text-fg-2">
            <span className="font-mono text-xs text-fg-3">{meta?.spark}</span> · submitted {fullDate(job.created_at)}
          </p>
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs">
            {Object.entries(job.params).map(([k, v]) => (
              <div key={k} className="flex gap-1.5">
                <dt className="text-fg-3">{meta?.params.find((p) => p.key === k)?.label ?? k}</dt>
                <dd className="font-mono text-fg">{String(v)}</dd>
              </div>
            ))}
            <div className="flex min-w-0 gap-1.5">
              <dt className="text-fg-3">Repositories</dt>
              <dd className="min-w-0">
                {job.repo_ids.map((r, i) => (
                  <span key={r}>
                    {i ? ", " : ""}
                    <Link href={`/repositories/${r}`} className="link">{name(r) ?? r.slice(0, 8)}</Link>
                  </span>
                ))}
              </dd>
            </div>
          </dl>
        </div>
        <div className="flex items-center gap-2">
          {job.status === "queued" ? (
            <button className="btn btn-danger" disabled={cancel.isPending} onClick={() => cancel.mutate(job.id)}>
              {cancel.isPending ? <Spinner /> : <Ban aria-hidden />} Cancel job
            </button>
          ) : null}
          {!ACTIVE_STATUSES.has(job.status) ? (
            <button className="btn" disabled={resubmit.isPending} onClick={rerun}>
              {resubmit.isPending ? <Spinner /> : <RotateCcw aria-hidden />} {job.status === "succeeded" ? "Run again" : "Retry"}
            </button>
          ) : null}
        </div>
      </header>
      {cancel.error ? <div className="mb-4"><InlineError error={cancel.error} /></div> : null}
      {resubmit.error ? <div className="mb-4"><InlineError error={resubmit.error} /></div> : null}

      <div className="grid gap-x-12 gap-y-8 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside aria-label="Job status" className="space-y-6">
          <JobLifecycle job={job} progress={progress} />
          <div className="space-y-2 border-t border-line pt-4 text-xs">
            <WorkerStatus />
            {active ? (
              <p className="text-2xs text-fg-3" aria-live="polite">
                {stream === "live" ? "Live updates connected." : stream === "connecting" ? "Connecting to live updates…" : "Live updates unavailable. Checking every 5 seconds."}
              </p>
            ) : null}
          </div>
          {job.metrics || job.attempts ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-4">
              {(
                [
                  ["Spark time", seconds(job.metrics?.duration_s)],
                  ["Queue wait", seconds(job.metrics?.queue_wait_s)],
                  ["Wall time", seconds(job.metrics?.wall_s)],
                  ["Attempts", String(job.attempts)],
                ] as const
              ).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-2xs text-fg-3">{k}</dt>
                  <dd className="font-mono text-sm tabular">{v}</dd>
                </div>
              ))}
              {job.metrics?.worker_id ? (
                <div className="col-span-2">
                  <dt className="text-2xs text-fg-3">Worker</dt>
                  <dd className="truncate font-mono text-xs">{String(job.metrics.worker_id)}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </aside>

        <section aria-labelledby="res-h" className="min-w-0">
          <h2 id="res-h" className="mb-5 border-b border-line pb-2 text-lg font-bold">Results</h2>
          {job.status === "succeeded" ? (
            results.isPending ? <Skeleton className="h-72" /> : results.isError ? <ErrorState error={results.error} retry={() => results.refetch()} compact /> : results.data ? <JobResultView results={results.data} repoName={name} /> : null
          ) : job.status === "failed" ? (
            <p className="text-sm text-fg-2">No results: the job failed. The error is on the timeline. Fix the cause (e.g. too few repositories or commits) and retry.</p>
          ) : job.status === "cancelled" ? (
            <p className="text-sm text-fg-2">No results: the job was cancelled.</p>
          ) : (
            <p className="text-sm text-fg-2">
              Results appear here when the job succeeds. Jobs on a Colab worker can take a few minutes; this page updates on its own.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

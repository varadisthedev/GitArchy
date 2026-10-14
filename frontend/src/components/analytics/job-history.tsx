"use client";

import Link from "next/link";
import type { Job } from "@/lib/api/types";
import { taskTitle } from "@/lib/analytics";
import { fullDate, relTime, seconds } from "@/lib/format";
import { JOB_TONE, JobStatusChip } from "@/components/ui/bits";

/** Job history on the spine: each node wears its job's state. */
export function JobHistory({ jobs, repoName }: { jobs: Job[]; repoName: (id: string) => string | undefined }) {
  return (
    <ol className="spine" aria-label="Analytics jobs">
      {jobs.map((j) => (
        <li key={j.id} className="relative border-b border-line-soft py-3 last:border-b-0">
          <span className="spine-node" data-tone={j.status === "queued" ? "warn" : JOB_TONE[j.status]} data-live={j.status === "running" ? "true" : undefined} />
          <div className="flex flex-wrap items-start gap-x-4 gap-y-1">
            <div className="min-w-0 flex-1">
              <Link href={`/analytics/jobs/${j.id}`} className="text-sm font-semibold after:absolute after:inset-0 hover:underline">
                {taskTitle(j.task_type)}
              </Link>
              <p className="mt-0.5 truncate text-2xs text-fg-3">
                {Object.entries(j.params).map(([k, v]) => `${k}=${v}`).join(" · ")}
                {" · "}
                {j.repo_ids.length === 1 ? repoName(j.repo_ids[0]) ?? "1 repository" : `${j.repo_ids.length} repositories`}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {j.metrics?.duration_s != null ? <span className="font-mono text-2xs text-fg-3 tabular">{seconds(j.metrics.duration_s)}</span> : null}
              <JobStatusChip status={j.status} />
              <time dateTime={j.created_at} title={fullDate(j.created_at)} className="w-20 text-right text-2xs text-fg-3">{relTime(j.created_at)}</time>
            </div>
          </div>
          {j.status === "failed" && j.error ? <p className="mt-1 truncate font-mono text-2xs text-err">{j.error}</p> : null}
        </li>
      ))}
    </ol>
  );
}

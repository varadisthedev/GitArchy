"use client";

import { useMemo } from "react";
import { isApiError } from "@/lib/api/client";
import { useJobs, useRepos } from "@/lib/api/queries";
import { JobHistory } from "@/components/analytics/job-history";
import { JobLauncher } from "@/components/analytics/job-launcher";
import { EmptyState, ErrorState, PageHeader, SkeletonRows } from "@/components/ui/states";

export function Analytics({ repoId }: { repoId?: string }) {
  const jobs = useJobs(100);
  const repos = useRepos();
  const name = useMemo(() => {
    const m = new Map((repos.data ?? []).map((r) => [r.id, r.name]));
    return (id: string) => m.get(id);
  }, [repos.data]);
  const list = repoId ? jobs.data?.filter((j) => j.repo_ids.includes(repoId)) : jobs.data;
  const disabled = isApiError(jobs.error) && jobs.error.code === "analytics_disabled";

  return (
    <div className={repoId ? "" : "mx-auto max-w-[78rem]"}>
      {repoId ? null : (
        <PageHeader
          title="Analytics"
          description="Run Spark jobs over your repositories' Git history. Jobs queue on the API and execute on a connected Spark worker; results are kept with the job."
        />
      )}
      <div className="space-y-12">
        <JobLauncher fixedRepoId={repoId} />
        <section aria-labelledby="hist-h">
          <div className="mb-1 flex items-baseline justify-between border-b border-line pb-2">
            <h2 id="hist-h" className="text-lg font-bold">{repoId ? "Jobs on this repository" : "Job history"}</h2>
            {list?.length ? <span className="text-2xs text-fg-3">{list.length} {list.length === 1 ? "job" : "jobs"}</span> : null}
          </div>
          {jobs.isPending ? <SkeletonRows rows={4} label="Loading jobs" /> : null}
          {jobs.isError && !disabled ? <ErrorState error={jobs.error} retry={() => jobs.refetch()} compact /> : null}
          {disabled ? <p className="py-4 text-sm text-fg-2">Analytics is turned off on this server.</p> : null}
          {jobs.isSuccess && !list?.length ? (
            <EmptyState art="no-jobs" title="No jobs yet" compact>
              {repoId ? "Run one above. Its result will be linked here." : "Pick an operation above. Commit activity by day is a good first run."}
            </EmptyState>
          ) : null}
          {list?.length ? <JobHistory jobs={list} repoName={name} /> : null}
        </section>
      </div>
    </div>
  );
}

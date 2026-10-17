"use client";

import { Activity, ArrowRight, BookMarked, BookPlus, ChartNoAxesColumn } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { useJobs, useMe, useMyActivity, useRepos } from "@/lib/api/queries";
import { taskTitle } from "@/lib/analytics";
import { isApiError } from "@/lib/api/client";
import { relTime } from "@/lib/format";
import { ActivityFeed } from "@/components/activity/feed";
import { RepoList } from "@/components/repository/repo-list";
import { WorkerStatus } from "@/components/analytics/worker-status";
import { JobStatusChip } from "@/components/ui/bits";
import { EmptyState, ErrorState, PageHeader, Skeleton, SkeletonRows } from "@/components/ui/states";

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Working late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function Dashboard() {
  const me = useMe();
  const repos = useRepos();
  const activity = useMyActivity(100);
  const jobs = useJobs(5);

  const sorted = useMemo(() => (repos.data ?? []).toSorted((a, b) => b.updated_at.localeCompare(a.updated_at)), [repos.data]);
  const repoName = useMemo(() => {
    const m = new Map((repos.data ?? []).map((r) => [r.id, r.name]));
    return (id: string) => m.get(id);
  }, [repos.data]);
  const firstName = me.data?.display_name.split(/\s+/)[0];

  return (
    <div className="mx-auto max-w-[78rem]">
      <PageHeader
        title={firstName ? `${greeting()}, ${firstName}` : greeting()}
        description="Your repositories, what changed, and the analytics running on them."
        actions={
          <>
            <Link href="/analytics#new-job" className="btn">
              <ChartNoAxesColumn aria-hidden /> Run analytics
            </Link>
            <Link href="/repositories/new" className="btn btn-primary">
              <BookPlus aria-hidden /> New repository
            </Link>
          </>
        }
      />

      <div className="grid gap-x-10 gap-y-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-10">
          <section aria-labelledby="repos-h">
            <div className="mb-2 flex items-baseline justify-between gap-4 border-b border-line pb-2">
              <h2 id="repos-h" className="text-lg font-bold">Repositories</h2>
              {repos.data?.length ? (
                <Link href="/repositories" className="inline-flex items-center gap-1 text-xs font-semibold text-fg-2 hover:text-fg">
                  All {repos.data.length} <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              ) : null}
            </div>
            {repos.isPending ? <SkeletonRows rows={4} label="Loading repositories" /> : null}
            {repos.isError ? <ErrorState error={repos.error} retry={() => repos.refetch()} compact /> : null}
            {repos.isSuccess && !sorted.length ? (
              <EmptyState
                icon={<BookMarked />}
                title="Start with a repository"
                action={
                  <Link href="/repositories/new" className="btn btn-primary">
                    <BookPlus aria-hidden /> Create repository
                  </Link>
                }
                compact
              >
                Gitarchy creates a real Git repository with a README commit. From there you can edit files, branch, and run Spark
                analytics on its history.
              </EmptyState>
            ) : null}
            {sorted.length ? <RepoList repos={sorted.slice(0, 6)} meId={me.data?.id} compact /> : null}
          </section>

          <section aria-labelledby="act-h">
            <div className="mb-1 flex items-baseline justify-between gap-4 border-b border-line pb-2">
              <h2 id="act-h" className="text-lg font-bold">Your recent activity</h2>
              {activity.data?.length ? (
                <Link href="/activity" className="inline-flex items-center gap-1 text-xs font-semibold text-fg-2 hover:text-fg">
                  View all <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              ) : null}
            </div>
            {activity.isPending ? <SkeletonRows rows={5} label="Loading activity" /> : null}
            {activity.isError ? <ErrorState error={activity.error} retry={() => activity.refetch()} compact /> : null}
            {activity.isSuccess && !activity.data.length ? (
              <EmptyState icon={<Activity />} title="Nothing yet" compact>
                Commits, branches and repository changes you make show up here, newest first.
              </EmptyState>
            ) : null}
            {activity.data?.length ? (
              <ActivityFeed events={activity.data.slice(0, 12)} names={{ repo: repoName, actor: () => "You" }} />
            ) : null}
          </section>
        </div>

        <aside className="min-w-0 space-y-10" aria-label="Summary">
          <section aria-labelledby="jobs-h">
            <div className="mb-2 flex items-baseline justify-between gap-4 border-b border-line pb-2">
              <h2 id="jobs-h" className="text-base font-bold">Analytics jobs</h2>
              <Link href="/analytics" className="text-xs font-semibold text-fg-2 hover:text-fg">
                Open
              </Link>
            </div>
            <WorkerStatus />
            {jobs.isPending ? <Skeleton className="mt-3 h-16" /> : null}
            {jobs.isError ? (
              <p className="mt-3 text-xs text-fg-2">
                {isApiError(jobs.error) && jobs.error.code === "analytics_disabled"
                  ? "Analytics is turned off on this server."
                  : "Couldn't load jobs."}
              </p>
            ) : null}
            {jobs.isSuccess && !jobs.data.length ? (
              <p className="mt-3 text-xs text-fg-2">
                No jobs yet. Try <Link href="/analytics#new-job" className="link">commit activity by day</Link> on your
                repositories.
              </p>
            ) : null}
            {jobs.data?.length ? (
              <ul className="mt-2 divide-y divide-line-soft">
                {jobs.data.map((j) => (
                  <li key={j.id} className="relative py-2.5">
                    <Link href={`/analytics/jobs/${j.id}`} className="text-[0.84375rem] font-semibold after:absolute after:inset-0 hover:underline">
                      {taskTitle(j.task_type)}
                    </Link>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <JobStatusChip status={j.status} />
                      <span className="text-2xs text-fg-3">{relTime(j.created_at)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        </aside>
      </div>
    </div>
  );
}

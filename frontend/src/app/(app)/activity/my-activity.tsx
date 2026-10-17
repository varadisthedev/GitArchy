"use client";

import { Activity, Bell, SearchX, UserPlus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useMyActivity, useNotifications, useRepos } from "@/lib/api/queries";
import { fullDate, relTime } from "@/lib/format";
import { ActivityFeed } from "@/components/activity/feed";
import { CommitActivityChart } from "@/components/activity/commit-chart";
import { EmptyState, ErrorState, PageHeader, SkeletonRows } from "@/components/ui/states";

const TYPES = [
  { value: "all", label: "Everything" },
  { value: "commit.created", label: "Commits" },
  { value: "branch.created", label: "Branches" },
  { value: "repo.created", label: "New repositories" },
  { value: "repo.updated", label: "Settings changes" },
  { value: "member", label: "Membership" },
];

export function MyActivity() {
  const activity = useMyActivity(100);
  const notes = useNotifications();
  const repos = useRepos();
  const [type, setType] = useState("all");
  const [repo, setRepo] = useState("all");
  const name = useMemo(() => {
    const m = new Map((repos.data ?? []).map((r) => [r.id, r.name]));
    return (id: string) => m.get(id);
  }, [repos.data]);

  const inRepo = (activity.data ?? []).filter((e) => repo === "all" || e.repo_id === repo);
  const events = inRepo.filter(
    (e) => type === "all" || (type === "member" ? e.type.startsWith("member.") : e.type === type),
  );

  return (
    <div className="mx-auto max-w-[78rem]">
      <PageHeader title="Activity" description="What you've done across Gitarchy, and notices addressed to you." />
      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-labelledby="feed-h" className="min-w-0">
          {activity.isSuccess && activity.data.length ? (
            <div className="mb-8 rounded-lg border border-line bg-surface/40 p-4">
              <CommitActivityChart events={inRepo} capped={activity.data.length === 100} />
            </div>
          ) : null}
          <div className="mb-1 flex flex-wrap items-center gap-2 border-b border-line pb-2">
            <h2 id="feed-h" className="mr-auto text-lg font-bold">Your activity</h2>
            <label htmlFor="act-type" className="sr-only">Event type</label>
            <select id="act-type" className="select h-8 w-auto text-xs" value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <label htmlFor="act-repo" className="sr-only">Repository</label>
            <select id="act-repo" className="select h-8 w-auto max-w-[12rem] text-xs" value={repo} onChange={(e) => setRepo(e.target.value)}>
              <option value="all">All repositories</option>
              {(repos.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          {activity.isPending ? <SkeletonRows rows={6} label="Loading activity" /> : null}
          {activity.isError ? <ErrorState error={activity.error} retry={() => activity.refetch()} compact /> : null}
          {activity.isSuccess && !activity.data.length ? (
            <EmptyState icon={<Activity />} title="No activity yet" compact action={<Link href="/repositories/new" className="btn">Create a repository</Link>}>
              Creating repositories, committing and branching all show up here.
            </EmptyState>
          ) : null}
          {activity.isSuccess && activity.data.length > 0 && !events.length ? <EmptyState icon={<SearchX />} title="Nothing matches these filters" compact /> : null}
          {events.length ? <ActivityFeed events={events} names={{ repo: name, actor: () => "You" }} /> : null}
          {activity.data?.length === 100 ? <p className="mt-4 text-2xs text-fg-3">Showing your latest 100 events.</p> : null}
        </section>

        <aside aria-labelledby="notes-h">
          <div className="mb-2 border-b border-line pb-2">
            <h2 id="notes-h" className="flex items-center gap-2 text-base font-bold"><Bell className="size-4 text-fg-3" aria-hidden /> Notifications</h2>
          </div>
          {notes.isPending ? <SkeletonRows rows={3} label="Loading notifications" /> : null}
          {notes.isError ? <ErrorState error={notes.error} retry={() => notes.refetch()} compact /> : null}
          {notes.isSuccess && !notes.data.length ? <p className="py-3 text-xs text-fg-2">When someone adds you to a repository, you&apos;ll see it here.</p> : null}
          <ul className="divide-y divide-line-soft">
            {notes.data?.map((x) => (
              <li key={x.id} className="flex gap-2.5 py-2.5">
                <UserPlus className="mt-0.5 size-4 flex-none text-fg-3" aria-hidden />
                <div className="min-w-0 text-xs">
                  {x.type === "repo.invited" ? (
                    <p>
                      Added to{" "}
                      <Link href={`/repositories/${x.data.repo_id}`} className="font-bold hover:underline">{name(String(x.data.repo_id)) ?? "a repository"}</Link> as{" "}
                      {String(x.data.role)}
                    </p>
                  ) : (
                    <p>{x.type}</p>
                  )}
                  <time dateTime={x.ts} title={fullDate(x.ts)} className="text-2xs text-fg-3">{relTime(x.ts)}</time>
                </div>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}

"use client";

import { ArrowLeft, FolderTree } from "lucide-react";
import Link from "next/link";
import { useCommit, useDiff, useRepo } from "@/lib/api/queries";
import { fullDate, relTime, shortSha } from "@/lib/format";
import { CopySha } from "@/components/git/commit-list";
import { DiffView } from "@/components/git/diff-view";
import { commitHref, commitsHref, treeHref } from "@/components/repository/urls";
import { Avatar } from "@/components/ui/bits";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";

export function CommitDetail({ id, sha }: { id: string; sha: string }) {
  const repo = useRepo(id);
  const c = useCommit(id, sha);
  const commit = c.data;
  const parent = commit?.parents[0];
  const diff = useDiff(id, parent, commit?.sha);

  if (c.isError) return <ErrorState error={c.error} retry={() => c.refetch()} />;
  if (c.isSuccess && !commit) return <EmptyState art="not-found" title="Commit not found">No commit with that SHA exists in this repository.</EmptyState>;

  return (
    <div className="space-y-6">
      <Link href={commitsHref(id, repo.data?.default_branch ?? "")} className="inline-flex items-center gap-1 text-xs font-semibold text-fg-2 hover:text-fg">
        <ArrowLeft className="size-3.5" aria-hidden /> Commits
      </Link>

      {!commit ? (
        <div className="space-y-3" role="status" aria-label="Loading commit">
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-4 w-80" />
        </div>
      ) : (
        <header className="rounded-md border border-line">
          <div className="flex flex-wrap items-start gap-3 px-4 py-4">
            <h2 className="min-w-0 flex-1 text-lg font-bold break-words">{commit.message || "No message"}</h2>
            <Link href={treeHref(id, commit.sha)} className="btn">
              <FolderTree aria-hidden /> Browse files
            </Link>
          </div>
          <dl className="grid gap-x-8 gap-y-3 border-t border-line bg-surface/40 px-4 py-3 text-xs sm:grid-cols-[auto_auto_1fr]">
            <div className="flex items-center gap-2">
              <Avatar name={commit.author_name} size={22} />
              <div>
                <dt className="sr-only">Author</dt>
                <dd className="font-semibold">{commit.author_name}</dd>
                {/* browser commits carry a synthetic noreply address; only show real ones */}
                {commit.author_email.endsWith("@users.noreply.gitarchey.local") ? null : <dd className="text-2xs text-fg-3">{commit.author_email}</dd>}
              </div>
            </div>
            <div>
              <dt className="text-2xs text-fg-3">Committed</dt>
              <dd>
                <time dateTime={commit.date} title={fullDate(commit.date)}>{fullDate(commit.date)}</time>
                <span className="text-fg-3"> · {relTime(commit.date)}</span>
              </dd>
            </div>
            <div className="min-w-0 sm:text-right">
              <dt className="text-2xs text-fg-3">Commit</dt>
              <dd className="flex items-center gap-1 sm:justify-end">
                <code className="truncate font-mono text-[0.75rem] text-stone-hi">{commit.sha}</code>
                <CopySha sha={commit.sha} />
              </dd>
              <dd className="mt-0.5 text-2xs text-fg-3">
                {commit.parents.length === 0 ? (
                  "Root commit"
                ) : (
                  <>
                    {commit.parents.length > 1 ? "Parents " : "Parent "}
                    {commit.parents.map((p, i) => (
                      <span key={p}>
                        {i ? ", " : ""}
                        <Link href={commitHref(id, p)} className="font-mono text-fg-2 hover:text-fg hover:underline">{shortSha(p)}</Link>
                      </span>
                    ))}
                  </>
                )}
              </dd>
            </div>
          </dl>
        </header>
      )}

      {commit && !parent ? (
        <EmptyState
          title="This is the first commit"
          compact
          action={<Link href={treeHref(id, commit.sha)} className="btn"><FolderTree aria-hidden /> Browse files at this commit</Link>}
        >
          It has no parent to compare against, so there&apos;s no diff. Every file it contains was added here.
        </EmptyState>
      ) : null}
      {commit?.parents.length && commit.parents.length > 1 ? (
        <p className="text-xs text-fg-3">Showing changes against the first parent ({shortSha(commit.parents[0])}).</p>
      ) : null}
      {parent && diff.isPending ? <Skeleton className="h-64" /> : null}
      {diff.isError ? <ErrorState error={diff.error} retry={() => diff.refetch()} compact /> : null}
      {diff.data ? <DiffView diff={diff.data} /> : null}
    </div>
  );
}

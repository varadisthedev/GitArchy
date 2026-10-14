"use client";

import { History } from "lucide-react";
import Link from "next/link";
import { useCommits } from "@/lib/api/queries";
import { fullDate, relTime, shortSha } from "@/lib/format";
import { Avatar } from "@/components/ui/bits";
import { Skeleton } from "@/components/ui/states";
import { commitHref, commitsHref } from "./urls";

/** The newest commit touching `path` on `ref`, with a link to that path's history. */
export function LastCommit({ repoId, gitRef, path }: { repoId: string; gitRef: string; path: string }) {
  const c = useCommits(repoId, gitRef, path, 0, 1);
  const commit = c.data?.[0];
  return (
    <div className="flex min-h-11 items-center gap-3 border-b border-line bg-surface/50 px-3 py-2 text-xs">
      {c.isPending ? (
        <Skeleton className="h-4 w-80 max-w-full" />
      ) : commit ? (
        <>
          <Avatar name={commit.author_name} size={20} />
          <span className="flex-none font-semibold text-fg">{commit.author_name}</span>
          <Link href={commitHref(repoId, commit.sha)} className="min-w-0 truncate text-fg-2 hover:text-fg hover:underline">
            {commit.message}
          </Link>
          <span className="ml-auto flex flex-none items-center gap-3">
            <Link href={commitHref(repoId, commit.sha)} className="font-mono text-2xs text-stone-hi hover:underline">
              {shortSha(commit.sha)}
            </Link>
            <time dateTime={commit.date} title={fullDate(commit.date)} className="hidden text-fg-3 sm:inline">
              {relTime(commit.date)}
            </time>
            <Link href={commitsHref(repoId, gitRef, path)} className="btn btn-ghost btn-sm">
              <History aria-hidden /> <span className="hidden sm:inline">History</span>
            </Link>
          </span>
        </>
      ) : (
        <span className="text-fg-3">No commits touch this path.</span>
      )}
    </div>
  );
}

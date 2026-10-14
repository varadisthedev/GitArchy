"use client";

import { Check, Copy, FolderTree, GitMerge } from "lucide-react";
import Link from "next/link";
import { Fragment, useState } from "react";
import type { Commit } from "@/lib/api/types";
import { dayKey, dayLabel, fullDate, relTime, shortSha } from "@/lib/format";
import { Avatar } from "@/components/ui/bits";
import { commitHref, treeHref } from "@/components/repository/urls";

export function CopySha({ sha, label = "Copy full SHA" }: { sha: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm btn-icon"
      aria-label={done ? "Copied" : label}
      title={done ? "Copied" : label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(sha);
          setDone(true);
          window.setTimeout(() => setDone(false), 1500);
        } catch {}
      }}
    >
      {done ? <Check className="text-ok" /> : <Copy />}
    </button>
  );
}

/** Commit history on the spine: one node per commit, merges drawn as hollow double nodes, day breaks dashed. */
export function CommitList({ repoId, commits }: { repoId: string; commits: Commit[] }) {
  return (
    <ol className="spine" aria-label="Commits">
      {commits.map((c, i) => {
        const header = i === 0 || dayKey(commits[i - 1].date) !== dayKey(c.date);
        const merge = c.parents.length > 1;
        return (
          <Fragment key={c.sha}>
            {header ? (
              <li className="spine-day">
                <h3>Commits on {dayLabel(c.date)}</h3>
              </li>
            ) : null}
            <li className="group border-b border-line-soft py-2.5 last:border-b-0">
              <span className="spine-node" data-tone={merge ? "info" : c.parents.length === 0 ? "ok" : "solid"} />
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <Link href={commitHref(repoId, c.sha)} className="block text-[0.875rem] font-semibold break-words text-fg hover:underline">
                    {merge ? <GitMerge className="mr-1.5 inline size-3.5 align-[-2px] text-info" aria-label="Merge commit" /> : null}
                    {c.message || <span className="text-fg-3 italic">No message</span>}
                  </Link>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 text-2xs text-fg-3">
                    <Avatar name={c.author_name} size={16} />
                    <span className="font-semibold text-fg-2">{c.author_name}</span>
                    <span>
                      committed <time dateTime={c.date} title={fullDate(c.date)}>{relTime(c.date)}</time>
                    </span>
                    {c.parents.length === 0 ? <span className="chip h-4 text-[0.6875rem]">root</span> : null}
                  </p>
                </div>
                <div className="flex flex-none items-center gap-0.5">
                  <Link href={commitHref(repoId, c.sha)} className="rounded-sm px-1.5 py-1 font-mono text-2xs text-stone-hi hover:bg-surface hover:underline">
                    {shortSha(c.sha)}
                  </Link>
                  <CopySha sha={c.sha} />
                  <Link href={treeHref(repoId, c.sha)} className="btn btn-ghost btn-sm btn-icon" aria-label={`Browse files at ${shortSha(c.sha)}`} title="Browse files at this commit">
                    <FolderTree />
                  </Link>
                </div>
              </div>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}

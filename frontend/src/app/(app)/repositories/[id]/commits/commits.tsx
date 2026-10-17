"use client";

import { ChevronLeft, ChevronRight, GitCommitHorizontal, GitCompareArrows, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { COMMIT_PAGE, useCommits, useRepo } from "@/lib/api/queries";
import { atLeast } from "@/lib/api/types";
import { CommitList } from "@/components/git/commit-list";
import { BranchPicker } from "@/components/repository/branch-picker";
import { commitsHref } from "@/components/repository/urls";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";

export function Commits({ id, refParam, path, page }: { id: string; refParam?: string; path: string; page: number }) {
  const repo = useRepo(id);
  const router = useRouter();
  const ref = refParam || repo.data?.default_branch || "";
  const skip = page * COMMIT_PAGE;
  // fetch one extra to know whether an older page exists
  const commits = useCommits(id, ref, path, skip, COMMIT_PAGE + 1);
  const list = commits.data?.slice(0, COMMIT_PAGE) ?? [];
  const hasOlder = (commits.data?.length ?? 0) > COMMIT_PAGE;
  const pageHref = (p: number) => `${commitsHref(id, ref, path)}${p ? `&page=${p}` : ""}`; // ref is always set, so the query string exists

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <BranchPicker repoId={id} current={ref} canCreate={atLeast(repo.data?.role, "writer")} onSelect={(r) => router.push(commitsHref(id, r, path))} />
        {path ? (
          <span className="chip h-8 gap-1.5 px-2 font-mono text-[0.75rem]">
            {path}
            <Link href={commitsHref(id, ref)} aria-label="Show history for the whole repository" className="rounded-sm text-fg-3 hover:text-fg">
              <X className="!size-3.5" />
            </Link>
          </span>
        ) : null}
        <Link href={`/repositories/${id}/compare${ref ? `?head=${encodeURIComponent(ref)}` : ""}`} className="btn ml-auto">
          <GitCompareArrows aria-hidden /> Compare
        </Link>
      </div>
      <h2 className="sr-only">History{path ? ` of ${path}` : ""} on {ref}</h2>

      {commits.isPending || !ref ? <SkeletonRows rows={8} label="Loading commits" /> : null}
      {commits.isError ? <ErrorState error={commits.error} retry={() => commits.refetch()} /> : null}
      {commits.isSuccess && !list.length ? (
        <EmptyState icon={<GitCommitHorizontal />} title={page ? "No older commits" : "No commits"}>
          {path ? "No commit on this branch touches that path." : "This branch has no history."}
        </EmptyState>
      ) : null}
      {list.length ? <CommitList repoId={id} commits={list} /> : null}

      {page > 0 || hasOlder ? (
        <nav aria-label="Commit pages" className="flex items-center justify-center gap-2 pt-2">
          {page > 0 ? (
            <Link href={pageHref(page - 1)} className="btn"><ChevronLeft aria-hidden /> Newer</Link>
          ) : (
            <span className="btn" aria-disabled="true" style={{ color: "var(--fg-4)", background: "transparent" }}><ChevronLeft aria-hidden /> Newer</span>
          )}
          {hasOlder ? (
            <Link href={pageHref(page + 1)} className="btn">Older <ChevronRight aria-hidden /></Link>
          ) : (
            <span className="btn" aria-disabled="true" style={{ color: "var(--fg-4)", background: "transparent" }}>Older <ChevronRight aria-hidden /></span>
          )}
        </nav>
      ) : null}
    </div>
  );
}

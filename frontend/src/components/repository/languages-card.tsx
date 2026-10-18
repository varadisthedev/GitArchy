"use client";

import { ChartNoAxesColumn } from "lucide-react";
import Link from "next/link";
import { useRepoLanguages } from "@/lib/api/queries";
import { relTime, fullDate } from "@/lib/format";
import { LanguageBar } from "@/components/analytics/language-bar";
import { Skeleton } from "@/components/ui/states";

/**
 * What this repository is made of, from the last Language breakdown job run against it alone.
 *
 * Nothing is computed here: the figures are whatever Spark last reduced over the file tree, so the
 * card says when that was rather than implying it is live. With no run yet it points at the job
 * instead of quietly showing nothing.
 */
export function LanguagesCard({ repoId }: { repoId: string }) {
  const q = useRepoLanguages(repoId);
  if (q.isError) return null; // a missing breakdown is not worth an error on the code page

  return (
    <section aria-labelledby="langs-h" className="rounded-md border border-line px-4 py-3.5">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 id="langs-h" className="text-sm font-bold">Languages</h2>
        {q.data?.finished_at ? (
          <time dateTime={q.data.finished_at} title={fullDate(q.data.finished_at)} className="text-2xs text-fg-3">
            measured {relTime(q.data.finished_at)}
          </time>
        ) : null}
      </div>
      {q.isPending ? <Skeleton className="h-10" /> : null}
      {q.data?.result ? (
        <LanguageBar languages={q.data.result.languages} totalBytes={q.data.result.total_bytes} />
      ) : q.isSuccess ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-2">
          No breakdown yet.
          <Link href={`/repositories/${repoId}/analytics`} className="link inline-flex items-center gap-1">
            <ChartNoAxesColumn className="size-3.5" aria-hidden /> Run the Language breakdown
          </Link>
          to measure this repository with Spark.
        </p>
      ) : null}
    </section>
  );
}

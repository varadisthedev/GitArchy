"use client";

import { Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { useRepo, useSearch } from "@/lib/api/queries";
import { atLeast, type SearchHit } from "@/lib/api/types";
import { plural } from "@/lib/format";
import { BranchPicker } from "@/components/repository/branch-picker";
import { blobHref, entryIcon, searchHref } from "@/components/repository/urls";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";

/** Split a matched line on every occurrence of the needle so the match itself can be marked. */
function parts(text: string, needle: string): { s: string; hit: boolean }[] {
  const hay = text.toLowerCase();
  const key = needle.toLowerCase();
  const out: { s: string; hit: boolean }[] = [];
  let at = 0;
  for (let i = hay.indexOf(key); i >= 0 && key; i = hay.indexOf(key, at)) {
    if (i > at) out.push({ s: text.slice(at, i), hit: false });
    out.push({ s: text.slice(i, i + key.length), hit: true });
    at = i + key.length;
  }
  if (at < text.length) out.push({ s: text.slice(at), hit: false });
  return out;
}

export function CodeSearch({ id, refParam, query, path }: { id: string; refParam?: string; query: string; path: string }) {
  const repo = useRepo(id);
  const router = useRouter();
  const ref = refParam || repo.data?.default_branch || "";
  const [needle, setNeedle] = useState(query);
  const results = useSearch(id, ref, query, path);

  const groups = useMemo(() => {
    const byFile = new Map<string, SearchHit[]>();
    for (const h of results.data?.hits ?? []) {
      const list = byFile.get(h.path);
      if (list) list.push(h);
      else byFile.set(h.path, [h]);
    }
    return [...byFile];
  }, [results.data]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const q = needle.trim();
    if (q.length >= 2) router.push(searchHref(id, ref, q, path));
  }

  const total = results.data?.hits.length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <BranchPicker repoId={id} current={ref} canCreate={atLeast(repo.data?.role, "writer")} onSelect={(r) => router.push(searchHref(id, r, query, path))} />
        <form onSubmit={submit} role="search" className="order-last flex w-full min-w-0 items-center gap-2 sm:order-none sm:w-auto sm:flex-1">
          <label htmlFor="repo-search" className="sr-only">Search this repository</label>
          <input
            id="repo-search"
            className="input flex-1 font-mono text-[0.8125rem]"
            type="search"
            placeholder="Find text in files…"
            value={needle}
            onChange={(e) => setNeedle(e.target.value)}
            maxLength={200}
            autoFocus
          />
          <button type="submit" className="btn" disabled={needle.trim().length < 2}>
            <Search aria-hidden /> Search
          </button>
        </form>
        {path ? (
          <span className="chip h-8 gap-1.5 px-2 font-mono text-[0.75rem]">
            {path}
            <Link href={searchHref(id, ref, query)} aria-label="Search the whole repository" className="rounded-sm text-fg-3 hover:text-fg">
              <X className="!size-3.5" />
            </Link>
          </span>
        ) : null}
      </div>

      {!query ? (
        <EmptyState icon={<Search />} title="Search this repository">
          Matches are literal text, not patterns, and case is ignored. Only text files on <code className="font-mono text-fg">{ref || "the default branch"}</code> are
          searched — history is not.
        </EmptyState>
      ) : results.isPending ? (
        <SkeletonRows rows={6} label="Searching" />
      ) : results.isError ? (
        <ErrorState error={results.error} retry={() => results.refetch()} />
      ) : !total ? (
        <EmptyState icon={<Search />} title="No matches">
          Nothing in {path ? <code className="font-mono text-fg">{path}</code> : "this repository"} contains{" "}
          <code className="font-mono text-fg">{query}</code> on <code className="font-mono text-fg">{ref}</code>.
        </EmptyState>
      ) : (
        <>
          <p className="text-xs text-fg-2">
            {plural(total, "match", "matches")} in {plural(groups.length, "file")}
            {results.data?.truncated ? " — more were found than can be shown; narrow the search." : ""}
          </p>
          <div className="space-y-3">
            {groups.map(([file, hits]) => {
              const Icon = entryIcon(file, "file");
              return (
                <section key={file} className="overflow-hidden rounded-md border border-line" aria-label={file}>
                  <h3 className="flex items-center gap-2 border-b border-line bg-surface px-3 py-2">
                    <Icon className="size-3.5 flex-none text-fg-3" aria-hidden />
                    <Link href={blobHref(id, ref, file)} className="truncate font-mono text-xs font-semibold hover:underline">
                      {file}
                    </Link>
                    <span className="ml-auto flex-none text-2xs text-fg-3 tabular">{plural(hits.length, "match", "matches")}</span>
                  </h3>
                  <ul className="code-well divide-y divide-line-soft">
                    {hits.map((h) => (
                      <li key={h.line}>
                        <Link href={`${blobHref(id, ref, file)}#L${h.line}`} className="flex gap-3 px-3 py-1.5 hover:bg-surface/60">
                          <span className="w-10 flex-none text-right text-2xs text-fg-4 tabular">{h.line}</span>
                          <code className="min-w-0 flex-1 truncate font-mono text-xs text-fg-2">
                            {parts(h.text, query).map((p, i) =>
                              p.hit ? (
                                <mark key={i} className="rounded-sm bg-stone/30 text-fg">{p.s}</mark>
                              ) : (
                                <span key={i}>{p.s}</span>
                              ),
                            )}
                            {h.clipped ? <span className="text-fg-4"> …</span> : null}
                          </code>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

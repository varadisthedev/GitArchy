"use client";

import { BookMarked, CircleCheck, CircleX, Lock, Search, SearchX, Star } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { isApiError } from "@/lib/api/client";
import { useGithubRepos, useGithubStatus, useImportGithubRepo } from "@/lib/api/queries";
import type { GithubRepo } from "@/lib/api/types";
import { relTime } from "@/lib/format";
import { GithubButton, GithubMark } from "@/components/auth/github-button";
import { EmptyState, ErrorState, InlineError, PageHeader, SkeletonRows, Spinner } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

type Outcome = { state: "done"; repoId: string } | { state: "failed"; message: string } | { state: "running" };

export function ImportGithub() {
  const connected = useSearchParams().get("connected") === "1";
  const status = useGithubStatus();
  const repos = useGithubRepos(!!status.data?.connected);
  const importOne = useImportGithubRepo();
  const toast = useToast();

  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const [running, setRunning] = useState(false);
  // a ref, not state: the import loop reads this *while* it runs, where a state value would be stale
  const cancel = useRef(false);
  const [stopping, setStopping] = useState(false);

  const all = repos.data ?? [];
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter(
      (r) =>
        (!q || r.full_name.toLowerCase().includes(q) || (r.language ?? "").toLowerCase().includes(q)) &&
        (!onlyMine || r.owner.toLowerCase() === (status.data?.login ?? "").toLowerCase()),
    );
  }, [all, query, onlyMine, status.data?.login]);

  // already-here and un-importable rows can't be selected, so "select all" must skip them
  const selectable = useMemo(() => visible.filter((r) => r.importable && !r.imported), [visible]);

  function toggle(fullName: string) {
    setPicked((s) => {
      const next = new Set(s);
      if (!next.delete(fullName)) next.add(fullName);
      return next;
    });
  }

  /**
   * Imports run one at a time from the browser. A clone can take minutes, so sequencing keeps the
   * single backend instance (and its disk) from being hit by a dozen clones at once, and every row
   * reports its own result instead of one opaque batch.
   */
  async function run(targets: GithubRepo[]) {
    if (running || !targets.length) return;
    setRunning(true);
    cancel.current = false;
    setStopping(false);
    let ok = 0;
    let stopped = false;
    for (const repo of targets) {
      if (cancel.current) {
        stopped = true;
        break;
      }
      setOutcomes((o) => ({ ...o, [repo.full_name]: { state: "running" } }));
      try {
        const res = await importOne.mutateAsync({ full_name: repo.full_name });
        setOutcomes((o) => ({ ...o, [repo.full_name]: { state: "done", repoId: res.repo.id } }));
        setPicked((s) => {
          const next = new Set(s);
          next.delete(repo.full_name);
          return next;
        });
        ok += 1;
      } catch (err) {
        const message = isApiError(err) ? err.message : "Import failed.";
        setOutcomes((o) => ({ ...o, [repo.full_name]: { state: "failed", message } }));
      }
    }
    setRunning(false);
    setStopping(false);
    if (ok) {
      toast({
        tone: "ok",
        title: `Imported ${ok} ${ok === 1 ? "repository" : "repositories"}`,
        body: stopped ? "Stopped early; the rest were left alone." : "History and branches are ready to browse and analyse.",
      });
    }
  }

  if (status.isPending) return <SkeletonRows rows={4} label="Checking GitHub connection" />;

  if (status.data && !status.data.configured) {
    return (
      <>
        <PageHeader title="Import from GitHub" />
        <EmptyState icon={<GithubMark className="size-5" />} title="GitHub isn't configured on this server">
          This Gitarchy server has no GitHub OAuth app set up, so repositories can&apos;t be imported. An administrator
          needs to set <code className="font-mono text-2xs">GITHUB_CLIENT_ID</code>,{" "}
          <code className="font-mono text-2xs">GITHUB_CLIENT_SECRET</code> and{" "}
          <code className="font-mono text-2xs">GITHUB_OAUTH_REDIRECT_URI</code>.
        </EmptyState>
      </>
    );
  }

  if (!status.data?.connected) {
    return (
      <>
        <PageHeader title="Import from GitHub" description="Connect your GitHub account to copy repositories into Gitarchy, with full history and branches." />
        <div className="max-w-md rounded-lg border border-line bg-surface/40 p-5">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <GithubMark className="size-4" /> Connect GitHub
          </h2>
          <p className="mt-1.5 mb-4 text-sm text-fg-2">
            You&apos;ll be sent to GitHub to authorize read access. Nothing is imported until you pick the repositories.
          </p>
          <GithubButton mode="connect" next="/import/github" label="Connect GitHub account" className="btn btn-primary h-9 w-full" />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Import from GitHub"
        description={
          <>
            Connected as <span className="font-bold text-fg">{status.data.login}</span>
            {status.data.can_import_private ? " · private repositories included" : " · public repositories only"}
          </>
        }
        actions={
          <Link href="/settings" className="btn btn-sm">
            Manage connection
          </Link>
        }
      />
      {connected ? (
        <p role="status" className="mb-5 flex items-start gap-2 rounded-md border border-line bg-surface px-3 py-2.5 text-xs text-fg-2">
          <CircleCheck className="mt-0.5 size-3.5 flex-none text-ok" aria-hidden />
          <span>GitHub connected. Pick what to bring over.</span>
        </p>
      ) : null}

      {repos.isPending ? (
        <SkeletonRows rows={8} label="Loading your GitHub repositories" />
      ) : repos.error ? (
        <ErrorState error={repos.error} retry={() => repos.refetch()} />
      ) : !all.length ? (
        <EmptyState icon={<BookMarked />} title="No repositories on GitHub">
          This GitHub account has no repositories your authorization can read.
        </EmptyState>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-48 flex-1">
              <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fg-3" aria-hidden />
              <input
                className="input h-8 pl-8 text-xs"
                placeholder="Filter by name or language"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Filter repositories"
              />
            </div>
            <label className="flex items-center gap-1.5 text-xs text-fg-2">
              <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
              Only mine
            </label>
            <button
              type="button"
              className="btn btn-sm"
              disabled={running || !selectable.length}
              onClick={() => setPicked(new Set(selectable.map((r) => r.full_name)))}
            >
              Select all {selectable.length ? `(${selectable.length})` : ""}
            </button>
            <button type="button" className="btn btn-sm" disabled={running || !picked.size} onClick={() => setPicked(new Set())}>
              Clear
            </button>
          </div>

          <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-md border border-line bg-shell/95 px-3 py-2 backdrop-blur">
            <p className="text-xs text-fg-2">
              {picked.size ? (
                <>
                  <span className="font-bold text-fg">{picked.size}</span> selected
                </>
              ) : (
                "Select repositories to import"
              )}
            </p>
            <div className="ml-auto flex gap-2">
              {running ? (
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    cancel.current = true;
                    setStopping(true);
                  }}
                  disabled={stopping}
                >
                  {stopping ? "Stopping after this one…" : "Stop"}
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={running || !picked.size}
                onClick={() => run(selectable.filter((r) => picked.has(r.full_name)))}
              >
                {running ? (
                  <>
                    <Spinner /> Importing…
                  </>
                ) : (
                  `Import ${picked.size || ""}`.trim()
                )}
              </button>
            </div>
          </div>

          {importOne.error && !running ? <InlineError error={importOne.error} /> : null}

          <ul className="divide-y divide-line-soft rounded-md border border-line">
            {visible.map((r) => {
              const outcome = outcomes[r.full_name];
              const blocked = !r.importable || r.imported;
              return (
                <li key={r.full_name} className="flex items-start gap-3 px-3 py-2.5">
                  <input
                    type="checkbox"
                    className="mt-1 flex-none"
                    checked={picked.has(r.full_name)}
                    disabled={blocked || running}
                    onChange={() => toggle(r.full_name)}
                    aria-label={`Import ${r.full_name}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="truncate text-[0.84375rem] font-bold">{r.full_name}</span>
                      {r.private ? (
                        <span className="chip">
                          <Lock aria-hidden /> Private
                        </span>
                      ) : null}
                      {r.fork ? <span className="chip">Fork</span> : null}
                      {r.archived ? <span className="chip">Archived</span> : null}
                      {r.language ? <span className="text-2xs text-fg-3">{r.language}</span> : null}
                      {r.stars ? (
                        <span className="flex items-center gap-0.5 text-2xs text-fg-3">
                          <Star className="size-3" aria-hidden /> {r.stars}
                        </span>
                      ) : null}
                      {r.pushed_at ? <span className="text-2xs text-fg-3">pushed {relTime(r.pushed_at)}</span> : null}
                    </div>
                    {r.description ? <p className="mt-0.5 truncate text-xs text-fg-2">{r.description}</p> : null}
                    <RowStatus repo={r} outcome={outcome} />
                  </div>
                </li>
              );
            })}
          </ul>
          {!visible.length ? (
            <EmptyState icon={<SearchX />} title="Nothing matches that filter" compact>
              Clear the filter to see all {all.length} repositories.
            </EmptyState>
          ) : null}
        </>
      )}
    </>
  );
}

function RowStatus({ repo, outcome }: { repo: GithubRepo; outcome?: Outcome }) {
  if (outcome?.state === "running") {
    return (
      <p role="status" className="mt-1 flex items-center gap-1.5 text-2xs text-fg-2">
        <Spinner /> Cloning history…
      </p>
    );
  }
  if (outcome?.state === "done") {
    return (
      <p className="mt-1 flex items-center gap-1.5 text-2xs text-ok">
        <CircleCheck className="size-3" aria-hidden /> Imported ·{" "}
        <Link href={`/repositories/${outcome.repoId}`} className="link">
          open it
        </Link>
      </p>
    );
  }
  if (outcome?.state === "failed") {
    return (
      <p role="alert" className="mt-1 flex items-start gap-1.5 text-2xs text-err">
        <CircleX className="mt-px size-3 flex-none" aria-hidden /> {outcome.message}
      </p>
    );
  }
  if (repo.imported) return <p className="mt-1 text-2xs text-fg-3">A repository with this name is already here.</p>;
  if (repo.empty) return <p className="mt-1 text-2xs text-fg-3">Empty on GitHub — nothing to import.</p>;
  if (!repo.importable) return <p className="mt-1 text-2xs text-fg-3">Larger than this server&apos;s import limit.</p>;
  return null;
}

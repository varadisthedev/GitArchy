"use client";

import { BookMarked, BookPlus, Search, SearchX } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useMemo, useState } from "react";
import { useMe, useRepos } from "@/lib/api/queries";
import { RepoList } from "@/components/repository/repo-list";
import { EmptyState, ErrorState, PageHeader, SkeletonRows } from "@/components/ui/states";

type Vis = "all" | "public" | "private";
type Own = "all" | "mine" | "shared";
type Sort = "updated" | "name" | "created";

export function Repositories({ initialQ }: { initialQ: string }) {
  const repos = useRepos();
  const me = useMe();
  const router = useRouter();
  const [q, setQ] = useState(initialQ);
  const [vis, setVis] = useState<Vis>("all");
  const [own, setOwn] = useState<Own>("all");
  const [sort, setSort] = useState<Sort>("updated");
  const dq = useDeferredValue(q.trim().toLowerCase());

  const list = useMemo(() => {
    const meId = me.data?.id;
    return (repos.data ?? [])
      .filter(
        (r) =>
          (!dq || r.name.toLowerCase().includes(dq) || r.description.toLowerCase().includes(dq)) &&
          (vis === "all" || r.visibility === vis) &&
          (own === "all" || (own === "mine") === (r.owner_id === meId)),
      )
      .toSorted((a, b) =>
        sort === "name" ? a.name.localeCompare(b.name) : sort === "created" ? b.created_at.localeCompare(a.created_at) : b.updated_at.localeCompare(a.updated_at),
      );
  }, [repos.data, me.data?.id, dq, vis, own, sort]);

  const filtered = dq || vis !== "all" || own !== "all";
  const reset = () => {
    setQ("");
    setVis("all");
    setOwn("all");
    router.replace("/repositories");
  };

  return (
    <div className="mx-auto max-w-[78rem]">
      <PageHeader
        title="Repositories"
        description="Repositories you own or were added to."
        actions={
          <Link href="/repositories/new" className="btn btn-primary">
            <BookPlus aria-hidden /> New repository
          </Link>
        }
      />

      <div role="search" className="mb-3 flex flex-wrap items-center gap-2 border-b border-line pb-3">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fg-3" aria-hidden />
          <label htmlFor="repo-filter" className="sr-only">Find a repository</label>
          <input
            id="repo-filter"
            type="search"
            className="input h-8 pl-8 text-xs"
            placeholder="Find by name or description"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <label className="sr-only" htmlFor="f-own">Ownership</label>
        <select id="f-own" className="select h-8 w-auto text-xs" value={own} onChange={(e) => setOwn(e.target.value as Own)}>
          <option value="all">All repositories</option>
          <option value="mine">Owned by you</option>
          <option value="shared">Shared with you</option>
        </select>
        <label className="sr-only" htmlFor="f-vis">Visibility</label>
        <select id="f-vis" className="select h-8 w-auto text-xs" value={vis} onChange={(e) => setVis(e.target.value as Vis)}>
          <option value="all">Any visibility</option>
          <option value="public">Public</option>
          <option value="private">Private</option>
        </select>
        <label className="sr-only" htmlFor="f-sort">Sort</label>
        <select id="f-sort" className="select h-8 w-auto text-xs" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="updated">Last updated</option>
          <option value="created">Newest</option>
          <option value="name">Name</option>
        </select>
      </div>

      {repos.isSuccess ? (
        <p className="mb-1 text-2xs text-fg-3" aria-live="polite">
          {filtered ? `${list.length} of ${repos.data.length}` : repos.data.length} {repos.data.length === 1 ? "repository" : "repositories"}
        </p>
      ) : null}

      {repos.isPending ? <SkeletonRows rows={6} label="Loading repositories" /> : null}
      {repos.isError ? <ErrorState error={repos.error} retry={() => repos.refetch()} /> : null}
      {repos.isSuccess && !repos.data.length ? (
        <EmptyState
          icon={<BookMarked />}
          title="No repositories yet"
          action={
            <Link href="/repositories/new" className="btn btn-primary">
              Create your first repository
            </Link>
          }
        >
          Repositories you create, and ones collaborators add you to, appear here. Public repositories owned by others only
          show up once you&apos;re a member.
        </EmptyState>
      ) : null}
      {repos.isSuccess && repos.data.length > 0 && !list.length ? (
        <EmptyState icon={<SearchX />} title="No matches" action={<button className="btn" onClick={reset}>Clear filters</button>}>
          Nothing matches those filters.
        </EmptyState>
      ) : null}
      {list.length ? <RepoList repos={list} meId={me.data?.id} /> : null}
    </div>
  );
}

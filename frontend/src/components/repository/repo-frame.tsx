"use client";

import { Activity, ChartNoAxesColumn, FileCode2, GitBranch, GitCommitHorizontal, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useMembers, useRepo } from "@/lib/api/queries";
import { RoleChip, VisibilityChip } from "@/components/ui/bits";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { REPO_RE } from "@/components/layout/sidebar";

/** Repository chrome shared by every /repositories/[id]/* page. */
export function RepoFrame({ id, children }: { id: string; children: ReactNode }) {
  const repo = useRepo(id);
  const members = useMembers(id, repo.isSuccess);
  const owner = members.data?.find((m) => m.role === "owner");

  if (repo.isError) return <ErrorState error={repo.error} retry={() => repo.refetch()} />;

  return (
    <div className="mx-auto max-w-[90rem]">
      <header className="mb-5">
        {repo.data ? (
          <>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <h1 className="text-xl font-bold tracking-[-0.015em]">
                <span className="font-semibold text-fg-2">{owner?.display_name ?? "…"}</span>
                <span className="mx-1.5 font-normal text-fg-3">/</span>
                <Link href={`/repositories/${id}`} className="hover:underline">
                  {repo.data.name}
                </Link>
              </h1>
              <VisibilityChip v={repo.data.visibility} />
              <RoleChip role={repo.data.role} />
            </div>
            {repo.data.description ? <p className="mt-1.5 max-w-[80ch] text-sm text-fg-2">{repo.data.description}</p> : null}
          </>
        ) : (
          <div className="space-y-2.5" role="status" aria-label="Loading repository">
            <Skeleton className="h-6 w-72" />
            <Skeleton className="h-4 w-96 max-w-full" />
          </div>
        )}
        <RepoTabs id={id} />
      </header>
      {children}
    </div>
  );
}

// On large screens the sidebar carries repo navigation; below that, tabs do.
function RepoTabs({ id }: { id: string }) {
  const path = usePathname();
  const sub = path.match(REPO_RE)?.[2] ?? "";
  const base = `/repositories/${id}`;
  const tabs = [
    { href: base, label: "Code", icon: FileCode2, on: ["", "blob", "edit"].includes(sub) },
    { href: `${base}/commits`, label: "Commits", icon: GitCommitHorizontal, on: sub === "commits" || sub === "compare" },
    { href: `${base}/branches`, label: "Branches", icon: GitBranch, on: sub === "branches" },
    { href: `${base}/activity`, label: "Activity", icon: Activity, on: sub === "activity" },
    { href: `${base}/analytics`, label: "Analytics", icon: ChartNoAxesColumn, on: sub === "analytics" },
    { href: `${base}/settings`, label: "Settings", icon: Settings, on: sub === "settings" },
  ];
  return (
    <nav aria-label="Repository" className="-mx-4 mt-4 overflow-x-auto border-b border-line px-4 [mask-image:linear-gradient(to_right,black_72%,transparent_98%)] pr-10 lg:hidden">
      <ul className="flex gap-1">
        {tabs.map((t) => (
          <li key={t.href}>
            <Link
              href={t.href}
              aria-current={t.on ? "page" : undefined}
              className={`relative flex h-9 items-center gap-1.5 px-2.5 text-xs font-semibold whitespace-nowrap ${
                t.on ? "text-fg after:absolute after:inset-x-1 after:-bottom-px after:h-0.5 after:bg-stone" : "text-fg-2 hover:text-fg"
              }`}
            >
              <t.icon className="size-3.5" aria-hidden /> {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

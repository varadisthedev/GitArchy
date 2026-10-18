"use client";

import {
  Activity, ArrowLeft, BookMarked, ChartNoAxesColumn, CloudDownload, FileCode2, GitBranch,
  GitCommitHorizontal, Globe2, LayoutDashboard, Settings, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRepo } from "@/lib/api/queries";
import { VisibilityChip } from "@/components/ui/bits";

type Item = { href: string; label: string; icon: LucideIcon; match: (p: string) => boolean };

const GLOBAL: Item[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, match: (p) => p === "/dashboard" },
  { href: "/repositories", label: "Repositories", icon: BookMarked, match: (p) => p === "/repositories" || p === "/repositories/new" },
  { href: "/import/github", label: "Import", icon: CloudDownload, match: (p) => p.startsWith("/import") },
  { href: "/activity", label: "Activity", icon: Activity, match: (p) => p.startsWith("/activity") },
  { href: "/analytics", label: "Analytics", icon: ChartNoAxesColumn, match: (p) => p.startsWith("/analytics") },
  { href: "/survey", label: "Survey", icon: Globe2, match: (p) => p.startsWith("/survey") },
];

export const REPO_RE = /^\/repositories\/([0-9a-f-]{36})(?:\/([a-z]+))?/;

function repoItems(id: string): Item[] {
  const base = `/repositories/${id}`;
  const sub = (p: string) => p.match(REPO_RE)?.[2] ?? "";
  return [
    { href: base, label: "Code", icon: FileCode2, match: (p) => ["", "blob", "edit"].includes(sub(p)) },
    { href: `${base}/commits`, label: "Commits", icon: GitCommitHorizontal, match: (p) => ["commits", "compare"].includes(sub(p)) },
    { href: `${base}/branches`, label: "Branches", icon: GitBranch, match: (p) => sub(p) === "branches" },
    { href: `${base}/activity`, label: "Activity", icon: Activity, match: (p) => sub(p) === "activity" },
    { href: `${base}/analytics`, label: "Analytics", icon: ChartNoAxesColumn, match: (p) => sub(p) === "analytics" },
    { href: `${base}/settings`, label: "Settings", icon: Settings, match: (p) => sub(p) === "settings" },
  ];
}

function NavList({ items, collapsed, label }: { items: Item[]; collapsed: boolean; label: string }) {
  const path = usePathname();
  return (
    <ul aria-label={label} className="relative">
      {/* the rail: nav reads as a spine, the current page is its filled node */}
      {!collapsed ? <span aria-hidden className="absolute top-2 bottom-2 left-[17px] w-px bg-line" /> : null}
      {items.map((it) => {
        const active = it.match(path);
        return (
          <li key={it.href}>
            <Link
              href={it.href}
              aria-current={active ? "page" : undefined}
              title={collapsed ? it.label : undefined}
              aria-label={collapsed ? it.label : undefined}
              className={`group relative flex h-8 items-center gap-2.5 rounded-md text-[0.84375rem] font-medium transition-colors duration-150 ${
                collapsed ? "w-9 justify-center" : "pr-2 pl-8"
              } ${active ? "bg-surface text-fg" : "text-fg-2 hover:bg-surface/60 hover:text-fg"}`}
            >
              {!collapsed ? (
                <span
                  aria-hidden
                  className={`absolute left-[14px] size-[7px] rounded-full border transition-colors ${
                    active ? "border-stone bg-stone" : "border-transparent bg-transparent group-hover:border-stone-2 group-hover:bg-shell"
                  }`}
                />
              ) : null}
              <it.icon className={`size-4 flex-none ${active ? "text-stone-hi" : "text-fg-3 group-hover:text-fg-2"}`} aria-hidden />
              {collapsed ? null : <span className="truncate">{it.label}</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function SidebarNav({ collapsed = false }: { collapsed?: boolean }) {
  const path = usePathname();
  const repoId = path.match(REPO_RE)?.[1];
  return (
    <nav aria-label="Main" className={`flex h-full flex-col gap-5 py-4 ${collapsed ? "items-center px-2" : "px-3"}`}>
      {repoId ? <RepoContext id={repoId} collapsed={collapsed} /> : null}
      <div>
        {!collapsed && repoId ? <p className="mb-1.5 px-2 text-2xs font-semibold text-fg-3">Workspace</p> : null}
        <NavList items={GLOBAL} collapsed={collapsed} label="Workspace" />
      </div>
      <div className="mt-auto">
        <NavList
          items={[{ href: "/settings", label: "Account settings", icon: Settings, match: (p) => p === "/settings" }]}
          collapsed={collapsed}
          label="Account"
        />
      </div>
    </nav>
  );
}

function RepoContext({ id, collapsed }: { id: string; collapsed: boolean }) {
  const repo = useRepo(id);
  return (
    <div>
      {collapsed ? null : (
        <div className="mb-3 px-2">
          <Link href="/repositories" className="inline-flex items-center gap-1 text-2xs font-semibold text-fg-3 hover:text-fg">
            <ArrowLeft className="size-3" aria-hidden /> Repositories
          </Link>
          {repo.data ? (
            <div className="mt-2 flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-bold" title={repo.data.name}>
                {repo.data.name}
              </span>
              <VisibilityChip v={repo.data.visibility} />
            </div>
          ) : (
            <div className="skel mt-2.5 h-4 w-32" />
          )}
        </div>
      )}
      <NavList items={repoItems(id)} collapsed={collapsed} label="Repository" />
    </div>
  );
}

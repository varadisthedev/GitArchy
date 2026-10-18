import { BookMarked, GitBranch } from "lucide-react";
import Link from "next/link";
import type { Repo } from "@/lib/api/types";
import { fullDate, relTime } from "@/lib/format";
import { RoleChip, VisibilityChip } from "@/components/ui/bits";

/** Dense repository rows. Shows only what the API returns: no invented stars, languages or contributor counts. */
export function RepoList({
  repos, meId, compact = false, selected, onToggle,
}: {
  repos: Repo[];
  meId?: string;
  compact?: boolean;
  /** Passing both turns on selection. Only repositories you own get a checkbox: only an owner can delete one. */
  selected?: ReadonlySet<string>;
  onToggle?: (id: string) => void;
}) {
  return (
    <ul className="divide-y divide-line-soft">
      {repos.map((r) => (
        <li key={r.id} className="group relative flex items-start gap-3 px-1 py-3 transition-colors hover:bg-surface/40 sm:px-3">
          {onToggle && r.role === "owner" ? (
            <input
              type="checkbox"
              // z-10: the row's title link covers the whole row via after:inset-0
              className="relative z-10 mt-1 flex-none"
              checked={selected?.has(r.id) ?? false}
              onChange={() => onToggle(r.id)}
              aria-label={`Select ${r.name}`}
            />
          ) : onToggle ? (
            <span className="mt-0.5 size-4 flex-none" aria-hidden />
          ) : null}
          <BookMarked className="mt-[3px] size-4 flex-none text-fg-3" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link href={`/repositories/${r.id}`} className="text-[0.9375rem] font-bold text-fg after:absolute after:inset-0 hover:underline">
                {r.name}
              </Link>
              <VisibilityChip v={r.visibility} />
              {r.owner_id !== meId ? <RoleChip role={r.role} /> : null}
            </div>
            {!compact && r.description ? <p className="mt-1 line-clamp-2 max-w-[80ch] text-xs text-fg-2">{r.description}</p> : null}
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 text-2xs text-fg-3">
              <span className="inline-flex items-center gap-1">
                <GitBranch className="size-3" aria-hidden />
                <span className="font-mono">{r.default_branch}</span>
              </span>
              <span>
                Updated <time dateTime={r.updated_at} title={fullDate(r.updated_at)}>{relTime(r.updated_at)}</time>
              </span>
              {!compact ? (
                <span>
                  Created <time dateTime={r.created_at} title={fullDate(r.created_at)}>{relTime(r.created_at)}</time>
                </span>
              ) : null}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

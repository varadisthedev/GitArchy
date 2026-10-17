import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import type { ActivityEvent } from "@/lib/api/types";
import { dayKey, dayLabel, fullDate, relTime, shortSha } from "@/lib/format";

type Names = { repo: (id: string) => string | undefined; actor: (id: string) => string };

const TONE: Record<string, string> = {
  "commit.created": "solid",
  "branch.created": "info",
  "repo.created": "ok",
  "repo.imported": "ok",
  "repo.updated": "idle",
  "member.set": "idle",
  "member.removed": "idle",
};

function describe(e: ActivityEvent, n: Names, showRepo: boolean): ReactNode {
  const d = e.data;
  const repoName = n.repo(e.repo_id);
  const repoLink = (
    <Link href={`/repositories/${e.repo_id}`} className="font-bold text-fg hover:underline">
      {repoName ?? (typeof d.name === "string" ? d.name : "a repository")}
    </Link>
  );
  const inRepo = showRepo ? <> in {repoLink}</> : null;
  const actor = <span className="font-bold text-fg">{n.actor(e.actor_id)}</span>;
  switch (e.type) {
    case "commit.created":
      return (
        <>
          {actor} committed to <BranchName name={String(d.branch)} />
          {inRepo}
        </>
      );
    case "branch.created":
      return (
        <>
          {actor} created branch <BranchName name={String(d.branch)} />
          {inRepo}
        </>
      );
    case "repo.created":
      return <>{actor} created {repoLink}</>;
    case "repo.imported":
      return (
        <>
          {actor} imported {repoLink} from{" "}
          <span className="font-mono text-[0.78rem] text-fg">{String(d.source ?? "GitHub")}</span>
          {typeof d.branches === "number" ? <> · {d.branches} {d.branches === 1 ? "branch" : "branches"}</> : null}
        </>
      );
    case "repo.updated":
      return (
        <>
          {actor} updated {Array.isArray(d.fields) ? d.fields.join(" and ") : "settings"}
          {showRepo ? <> of {repoLink}</> : null}
        </>
      );
    case "member.set":
      return (
        <>
          {actor} gave <span className="font-bold text-fg">{n.actor(String(d.user_id))}</span> {String(d.role)} access
          {inRepo}
        </>
      );
    case "member.removed":
      return (
        <>
          {actor} removed <span className="font-bold text-fg">{n.actor(String(d.user_id))}</span>
          {showRepo ? <> from {repoLink}</> : null}
        </>
      );
    default:
      return (
        <>
          {actor} · {e.type}
          {inRepo}
        </>
      );
  }
}

function BranchName({ name }: { name: string }) {
  return <span className="rounded-sm bg-surface px-1 py-px font-mono text-[0.78rem] text-fg">{name}</span>;
}

export function ActivityFeed({
  events,
  names,
  showRepo = true,
  groupByDay = true,
}: {
  events: ActivityEvent[];
  names: Names;
  showRepo?: boolean;
  groupByDay?: boolean;
}) {
  return (
    <ol className="spine">
      {events.map((e, i) => {
        const header = groupByDay && (i === 0 || dayKey(events[i - 1].ts) !== dayKey(e.ts));
        const d = e.data;
        return (
          <Fragment key={e.id}>
            {header ? (
              <li className="spine-day" aria-hidden={false}>
                <h3>{dayLabel(e.ts)}</h3>
              </li>
            ) : null}
            <li className="py-2">
              <span className="spine-node" data-tone={TONE[e.type] ?? "idle"} />
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 pt-0.5">
                <p className="min-w-0 text-[0.84375rem] text-fg-2">{describe(e, names, showRepo)}</p>
                <time dateTime={e.ts} title={fullDate(e.ts)} className="text-2xs text-fg-3">
                  {relTime(e.ts)}
                </time>
              </div>
              {e.type === "commit.created" && typeof d.sha === "string" ? (
                <Link
                  href={`/repositories/${e.repo_id}/commits/${d.sha}`}
                  className="mt-1 flex max-w-full items-baseline gap-2 rounded-sm text-xs text-fg-2 hover:text-fg"
                >
                  <span className="font-mono text-2xs text-stone-hi">{shortSha(d.sha)}</span>
                  <span className="truncate">{String(d.message ?? "")}</span>
                  {typeof d.files === "number" ? (
                    <span className="flex-none text-2xs text-fg-3">
                      {d.files} {d.files === 1 ? "file" : "files"}
                    </span>
                  ) : null}
                </Link>
              ) : null}
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}

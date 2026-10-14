"use client";

import { Bell, UserPlus } from "lucide-react";
import Link from "next/link";
import { useNotifications, useRepos } from "@/lib/api/queries";
import { relTime } from "@/lib/format";
import { Popover } from "@/components/ui/popover";

// The backend lists notifications but has no mark-as-read endpoint, so there is no unread badge:
// a count that can never go down would be a lie.
export function Notifications() {
  const n = useNotifications();
  const repos = useRepos();
  const repoName = (id: unknown) => repos.data?.find((r) => r.id === id)?.name;

  return (
    <Popover
      button={<Bell aria-hidden />}
      buttonClassName="btn btn-ghost btn-icon"
      label="Notifications"
      align="end"
      className="menu w-[22rem] max-w-[calc(100vw-1rem)] p-0"
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between border-b border-[#474545] px-3.5 py-2.5">
            <h2 className="text-sm font-bold">Notifications</h2>
          </div>
          <div className="max-h-[24rem] overflow-auto p-1.5">
            {n.isPending ? <p className="px-2 py-3 text-xs text-fg-3">Loading…</p> : null}
            {n.isError ? <p className="px-2 py-3 text-xs text-err">Couldn&apos;t load notifications.</p> : null}
            {n.isSuccess && !n.data.length ? (
              <p className="px-2 py-3 text-xs text-fg-2">
                Nothing yet. You&apos;ll hear about it here when someone adds you to a repository.
              </p>
            ) : null}
            {n.data?.map((x) =>
              x.type === "repo.invited" ? (
                <Link
                  key={x.id}
                  href={`/repositories/${x.data.repo_id}`}
                  onClick={close}
                  className="menu-item items-start"
                >
                  <UserPlus aria-hidden className="mt-0.5" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs">
                      You were added to <strong className="font-bold">{repoName(x.data.repo_id) ?? "a repository"}</strong> as{" "}
                      {String(x.data.role)}
                    </span>
                    <span className="text-2xs text-fg-3">{relTime(x.ts)}</span>
                  </span>
                </Link>
              ) : (
                <div key={x.id} className="menu-item items-start">
                  <Bell aria-hidden className="mt-0.5" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs">{x.type}</span>
                    <span className="text-2xs text-fg-3">{relTime(x.ts)}</span>
                  </span>
                </div>
              ),
            )}
          </div>
        </div>
      )}
    </Popover>
  );
}

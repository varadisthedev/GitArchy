"use client";

import { CloudDownload, HardDriveDownload, TriangleAlert } from "lucide-react";
import { useRestoreRepo } from "@/lib/api/queries";
import type { Repo } from "@/lib/api/types";
import { InlineError, Spinner } from "@/components/ui/states";

/**
 * Only for a repository with no Git data anywhere: not on this instance, and not in object storage.
 * A repository that is merely absent from this instance is restored automatically on the next read,
 * so it never reaches here. This state is unrecoverable except from the origin it was imported from.
 */
export function RestoreBanner({ repo }: { repo: Repo }) {
  const restore = useRestoreRepo(repo.id);
  if (!repo.storage_missing) return null;

  const canRestore = repo.source && (repo.role === "owner" || repo.role === "admin");
  return (
    <div className="mb-5 rounded-md border border-warn/40 bg-warn/5 p-4">
      <p className="flex items-center gap-2 text-sm font-bold">
        <TriangleAlert className="size-4 text-warn" aria-hidden />
        This repository&apos;s files aren&apos;t on the server
      </p>
      <p className="mt-1.5 max-w-[72ch] text-xs text-fg-2">
        Its details, members and history index are safe in the database, but there&apos;s no copy of the
        Git data in object storage either — it predates durable storage, or was never stored. Files,
        commits, branches and analytics stay unavailable until it&apos;s back.
      </p>
      {canRestore ? (
        <>
          <button className="btn mt-3" disabled={restore.isPending} onClick={() => restore.mutate()}>
            {restore.isPending ? <><Spinner /> Re-cloning from GitHub…</> : <><CloudDownload aria-hidden /> Restore from GitHub</>}
          </button>
          <p className="mt-1.5 flex items-center gap-1.5 font-mono text-2xs text-fg-3">
            <HardDriveDownload className="size-3" aria-hidden /> {repo.source}
          </p>
        </>
      ) : (
        <p className="mt-2 text-xs text-fg-3">
          {repo.source
            ? "Ask an owner or admin of this repository to restore it from GitHub."
            : "This repository was created here rather than imported, so there's no origin to re-clone from. Only its metadata can be recovered."}
        </p>
      )}
      {restore.error ? <div className="mt-2"><InlineError error={restore.error} /></div> : null}
    </div>
  );
}

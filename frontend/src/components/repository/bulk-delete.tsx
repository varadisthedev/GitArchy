"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useDeleteRepo } from "@/lib/api/queries";
import { isApiError } from "@/lib/api/client";
import type { Repo } from "@/lib/api/types";
import { useToast } from "@/components/ui/toast";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/states";

const CONFIRM = "delete";

/**
 * Sticky action bar for deleting several repositories at once. Deletion is one request per repository
 * (there is no bulk endpoint and no transaction), so the loop reports what actually happened rather
 * than assuming it all worked.
 */
export function BulkDelete({ repos, onDone, onClear }: { repos: Repo[]; onDone: (deleted: string[]) => void; onClear: () => void }) {
  const del = useDeleteRepo();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState<{ name: string; why: string }[]>([]);
  const running = del.isPending;

  async function run() {
    const deleted: string[] = [];
    const problems: typeof failed = [];
    setDone(0);
    setFailed([]);
    for (const r of repos) {
      try {
        await del.mutateAsync(r.id);
        deleted.push(r.id);
      } catch (e) {
        problems.push({ name: r.name, why: isApiError(e) ? e.message : "Couldn't delete this one." });
      }
      setDone(deleted.length + problems.length);
    }
    setFailed(problems);
    onDone(deleted);
    if (!problems.length) {
      setOpen(false);
      toast({ tone: "ok", title: `Deleted ${deleted.length} ${deleted.length === 1 ? "repository" : "repositories"}` });
    }
  }

  return (
    <>
      <div className="sticky bottom-3 z-20 mt-3 flex flex-wrap items-center gap-3 rounded-md border border-line bg-raised/95 px-3 py-2 shadow-pop backdrop-blur">
        <p className="text-xs font-semibold" aria-live="polite">
          {repos.length} selected
        </p>
        <div className="ml-auto flex items-center gap-2">
          <button className="btn btn-ghost h-8 text-xs" onClick={onClear}>Clear</button>
          <button
            className="btn btn-danger h-8 text-xs"
            onClick={() => { setTyped(""); setFailed([]); setDone(0); del.reset(); setOpen(true); }}
          >
            <Trash2 aria-hidden /> Delete {repos.length}
          </button>
        </div>
      </div>

      <Dialog
        open={open}
        onClose={() => (running ? undefined : setOpen(false))}
        title={`Delete ${repos.length} ${repos.length === 1 ? "repository" : "repositories"}?`}
        description="Every branch, commit and file is removed from the server and from object storage, along with collaborators and activity. This can't be undone."
      >
        <form
          onSubmit={(e) => { e.preventDefault(); if (typed === CONFIRM && !running) void run(); }}
          className="space-y-4"
        >
          <ul className="max-h-44 overflow-y-auto rounded-sm border border-line-soft px-3 py-2 font-mono text-2xs text-fg-2">
            {repos.map((r) => <li key={r.id}>{r.name}</li>)}
          </ul>
          <div>
            <label htmlFor="bulk-confirm" className="label">
              Type <code className="rounded-sm bg-surface px-1 font-mono">{CONFIRM}</code> to confirm
            </label>
            <input
              id="bulk-confirm"
              className="input font-mono"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              autoFocus
            />
          </div>
          {running ? (
            <p className="text-xs text-fg-2" aria-live="polite">Deleting {done + 1} of {repos.length}…</p>
          ) : null}
          {failed.length ? (
            <div className="rounded-sm bg-[var(--del-bg)] px-2 py-1.5 text-2xs text-err">
              <p className="font-semibold">{failed.length} couldn&apos;t be deleted:</p>
              <ul className="mt-1 space-y-0.5">
                {failed.map((f) => <li key={f.name}><span className="font-mono">{f.name}</span> — {f.why}</li>)}
              </ul>
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)} disabled={running}>Cancel</button>
            <button type="submit" className="btn btn-danger-solid" disabled={typed !== CONFIRM || running}>
              {running ? <><Spinner /> Deleting…</> : `Delete ${repos.length}`}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

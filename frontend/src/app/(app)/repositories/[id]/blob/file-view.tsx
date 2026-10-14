"use client";

import { Check, Copy, Download, FileWarning, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useCommitFiles, useFile, useRepo } from "@/lib/api/queries";
import { atLeast, type FileBlob } from "@/lib/api/types";
import { baseName, bytes, parentPath, plural } from "@/lib/format";
import { BranchPicker } from "@/components/repository/branch-picker";
import { CodeView } from "@/components/repository/code-view";
import { LastCommit } from "@/components/repository/last-commit";
import { Markdown } from "@/components/repository/markdown";
import { PathCrumbs } from "@/components/repository/path-crumbs";
import { blobHref, editHref, treeHref } from "@/components/repository/urls";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { EmptyState, ErrorState, InlineError, Skeleton, Spinner } from "@/components/ui/states";

const IMG: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", bmp: "image/bmp", ico: "image/x-icon", avif: "image/avif" };
const isBranchRef = (ref: string) => !/^[0-9a-f]{7,40}$/.test(ref);

function toBlob(f: FileBlob) {
  if (f.encoding === "utf-8") return new Blob([f.content], { type: "text/plain;charset=utf-8" });
  const bin = atob(f.content);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: "application/octet-stream" });
}

export function FileView({ id, refParam, path }: { id: string; refParam?: string; path: string }) {
  const repo = useRepo(id);
  const router = useRouter();
  const ref = refParam || repo.data?.default_branch || "";
  const file = useFile(id, ref, path);
  const [mode, setMode] = useState<"preview" | "code">("preview");
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const canWrite = atLeast(repo.data?.role, "writer") && isBranchRef(ref);

  if (!repo.data) return <Skeleton className="h-96" />;
  const name = baseName(path);
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  const isMd = ext === "md" || ext === "markdown";
  const f = file.data;
  const lineCount = f?.encoding === "utf-8" ? f.content.split("\n").length - (f.content.endsWith("\n") ? 1 : 0) : 0;

  const download = () => {
    if (!f) return;
    const url = URL.createObjectURL(toBlob(f));
    const a = Object.assign(document.createElement("a"), { href: url, download: name });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <BranchPicker repoId={id} current={ref} canCreate={atLeast(repo.data.role, "writer")} onSelect={(r) => router.push(blobHref(id, r, path))} />
        <div className="order-last w-full min-w-0 px-1 sm:order-none sm:w-auto sm:flex-1">
          <PathCrumbs repoId={id} repoName={repo.data.name} gitRef={ref} path={path} />
        </div>
      </div>

      <section aria-label={name} className="overflow-hidden rounded-md border border-line">
        <LastCommit repoId={id} gitRef={ref} path={path} />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-3 py-2">
          {isMd && f?.encoding === "utf-8" ? (
            <div role="group" aria-label="View" className="inline-flex rounded-md border border-line p-0.5">
              {(["preview", "code"] as const).map((m) => (
                <button
                  key={m}
                  aria-pressed={mode === m}
                  onClick={() => setMode(m)}
                  className={`h-6 rounded-sm px-2.5 text-2xs font-semibold capitalize ${mode === m ? "bg-raised text-fg" : "text-fg-2 hover:text-fg"}`}
                >
                  {m}
                </button>
              ))}
            </div>
          ) : null}
          <p className="text-2xs text-fg-3 tabular">
            {f ? (
              <>
                {f.encoding === "utf-8" ? `${plural(lineCount, "line")} · ` : ""}
                {bytes(f.size)}
                {f.is_symlink ? " · symlink" : ""}
              </>
            ) : null}
          </p>
          <div className="ml-auto flex items-center gap-1">
            {f?.encoding === "utf-8" ? (
              <button
                className="btn btn-ghost btn-sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(f.content);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1600);
                  } catch {}
                }}
              >
                {copied ? <Check aria-hidden /> : <Copy aria-hidden />} {copied ? "Copied" : "Copy"}
              </button>
            ) : null}
            <button className="btn btn-ghost btn-sm" onClick={download} disabled={!f}>
              <Download aria-hidden /> Download
            </button>
            {canWrite && f?.encoding === "utf-8" && !f.is_symlink ? (
              <Link href={editHref(id, ref, path)} className="btn btn-sm">
                <Pencil aria-hidden /> Edit
              </Link>
            ) : null}
            {canWrite && f ? (
              <button className="btn btn-danger btn-sm btn-icon" aria-label={`Delete ${name}`} title="Delete file" onClick={() => setConfirmDelete(true)}>
                <Trash2 aria-hidden />
              </button>
            ) : null}
          </div>
        </div>

        {file.isPending ? (
          <div className="code-well space-y-2 p-4">{Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-3.5" />)}</div>
        ) : file.isError ? (
          <ErrorState error={file.error} retry={() => file.refetch()} compact />
        ) : f?.is_symlink ? (
          <div className="px-4 py-6 text-sm text-fg-2">
            Symbolic link to <code className="rounded-sm bg-surface px-1.5 py-0.5 font-mono text-xs text-fg">{f.content}</code>. Gitarchy
            never follows links inside repositories.
          </div>
        ) : f?.encoding === "base64" ? (
          IMG[ext] ? (
            <div className="flex justify-center bg-deep p-6 [background-image:repeating-conic-gradient(#141414_0_25%,#0d0d0d_0_50%)] [background-size:16px_16px]">
              {/* eslint-disable-next-line @next/next/no-img-element -- repository blob rendered as data URL */}
              <img src={`data:${IMG[ext]};base64,${f.content}`} alt={name} className="max-h-[70vh] max-w-full" />
            </div>
          ) : (
            <EmptyState icon={<FileWarning />} title="Binary file" compact action={<button className="btn" onClick={download}><Download aria-hidden /> Download {bytes(f.size)}</button>}>
              This file isn&apos;t text, so it can&apos;t be shown here.
            </EmptyState>
          )
        ) : f && isMd && mode === "preview" ? (
          <div className="px-5 py-6 sm:px-8">
            <Markdown source={f.content} repoId={id} gitRef={ref} dir={parentPath(path)} />
          </div>
        ) : f ? (
          f.content.length ? <CodeView code={f.content} path={path} /> : <p className="bg-deep px-4 py-6 text-xs text-fg-3">This file is empty.</p>
        ) : null}
      </section>

      <DeleteFileDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        repoId={id}
        branch={ref}
        path={path}
        parent={f?.commit}
        onDone={() => router.push(treeHref(id, ref, parentPath(path)))}
      />
    </div>
  );
}

function DeleteFileDialog({ open, onClose, repoId, branch, path, parent, onDone }: { open: boolean; onClose: () => void; repoId: string; branch: string; path: string; parent?: string; onDone: () => void }) {
  const commit = useCommitFiles(repoId);
  const toast = useToast();
  const [message, setMessage] = useState("");
  const msg = message.trim() || `Delete ${baseName(path)}`;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (commit.isPending) return;
    try {
      const r = await commit.mutateAsync({ branch, message: msg, changes: [{ path, delete: true }], expected_parent: parent });
      toast({ tone: "ok", title: `Deleted ${baseName(path)}`, body: `Committed ${r.sha.slice(0, 7)} to ${branch}.` });
      onClose();
      onDone();
    } catch {}
  }

  return (
    <Dialog open={open} onClose={onClose} title="Delete file" description={<>This commits the removal of <code className="font-mono text-fg">{path}</code> to <code className="font-mono text-fg">{branch}</code>. It stays in history.</>}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="del-msg" className="label">Commit message</label>
          <input id="del-msg" className="input" placeholder={`Delete ${baseName(path)}`} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} />
        </div>
        {commit.error ? <InlineError error={commit.error} /> : null}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-danger-solid" disabled={commit.isPending}>
            {commit.isPending ? <><Spinner /> Deleting…</> : "Delete and commit"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

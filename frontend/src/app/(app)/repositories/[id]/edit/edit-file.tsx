"use client";

import { FileUp, GitBranch, GitBranchPlus, Lock, Pencil, Upload, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { api, isApiError } from "@/lib/api/client";
import { useCommitFiles, useFile, useRepo } from "@/lib/api/queries";
import { atLeast, type FileChange } from "@/lib/api/types";
import { baseName, bytes, isSha, joinPath, plural } from "@/lib/format";
import { validBranch, validPath } from "@/lib/validation";
import { CodeEditor } from "@/components/repository/code-editor";
import { PathCrumbs } from "@/components/repository/path-crumbs";
import { blobHref, treeHref } from "@/components/repository/urls";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { EmptyState, ErrorState, InlineError, Skeleton, Spinner } from "@/components/ui/states";

const MAX_TEXT = 1_500_000; // backend FileChange.content max_length
const MAX_UPLOAD = 1_000_000; // bytes per file; base64 must stay under MAX_TEXT
const MAX_FILES = 50;

type Mode = "edit" | "new" | "upload";
type Pending = { path: string; data: string; size: number };

function readBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function EditFile({ id, refParam, path, dir, mode }: { id: string; refParam?: string; path: string; dir: string; mode: Mode }) {
  const repo = useRepo(id);
  const router = useRouter();
  const toast = useToast();
  const branch = refParam || repo.data?.default_branch || "";
  const original = useFile(id, branch, path, mode === "edit");
  const commit = useCommitFiles(id);

  const [content, setContent] = useState<string | null>(mode === "edit" ? null : "");
  const [newPath, setNewPath] = useState(mode === "edit" ? path : dir ? `${dir}/` : "");
  const [uploads, setUploads] = useState<Pending[]>([]);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [body, setBody] = useState("");
  const [target, setTarget] = useState<"current" | "new">("current");
  const [newBranch, setNewBranch] = useState("");
  const [errors, setErrors] = useState<{ path?: string; branch?: string; content?: string }>({});
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);

  // seed the editor once the original arrives (keyed page: one file per mount)
  const loaded = mode === "edit" && content === null && original.data?.encoding === "utf-8";
  if (loaded) setContent(original.data!.content);

  const text = content ?? "";
  const dirty =
    mode === "upload" ? uploads.length > 0 : mode === "new" ? text.length > 0 || newPath.replace(/\/$/, "") !== dir : text !== original.data?.content || newPath !== path;

  // unsaved-change guards: tab close/reload, and in-app link clicks
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a");
      if (!a || a.target === "_blank" || e.metaKey || e.ctrlKey || e.shiftKey || a.hasAttribute("download")) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || /^https?:/.test(href)) return;
      e.preventDefault();
      e.stopPropagation();
      setLeaveTo(href);
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  if (!repo.data) return <Skeleton className="h-96" />;
  if (!atLeast(repo.data.role, "writer"))
    return (
      <EmptyState icon={<Lock />} title="Read-only access" action={<Link className="btn" href={blobHref(id, branch, path)}>View file</Link>}>
        You&apos;re a reader on this repository. Ask an admin for writer access to edit files.
      </EmptyState>
    );
  if (isSha(branch))
    return <EmptyState title="Pick a branch to edit">You&apos;re viewing a commit. Commits are immutable; switch to a branch to make changes.</EmptyState>;
  if (mode === "edit" && original.isError) return <ErrorState error={original.error} retry={() => original.refetch()} />;
  if (mode === "edit" && original.data && original.data.encoding !== "utf-8")
    return <EmptyState title="Binary files can't be edited">Download it, change it locally, then upload the new version.</EmptyState>;

  const name = baseName(newPath) || "file";
  const defaultMsg = mode === "upload" ? `Upload ${plural(uploads.length, "file")}` : mode === "new" ? `Create ${name}` : newPath !== path ? `Rename ${baseName(path)} to ${name}` : `Update ${name}`;

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    setUploadErr(null);
    const next: Pending[] = [];
    for (const f of Array.from(list)) {
      if (f.size > MAX_UPLOAD) {
        setUploadErr(`${f.name} is ${bytes(f.size)}. Files must be 1 MB or smaller to upload in the browser.`);
        continue;
      }
      next.push({ path: joinPath(dir, f.name), data: await readBase64(f), size: f.size });
    }
    setUploads((u) => {
      const merged = [...u.filter((x) => !next.some((n) => n.path === x.path)), ...next];
      if (merged.length > MAX_FILES) setUploadErr(`A commit can hold at most ${MAX_FILES} files.`);
      return merged.slice(0, MAX_FILES);
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (commit.isPending || step) return;
    const errs: typeof errors = {};
    const p = newPath.trim().replace(/\/+$/, "");
    if (mode !== "upload") {
      const pe = validPath(p);
      if (pe) errs.path = pe;
      if (text.length > MAX_TEXT) errs.content = `This file is ${bytes(text.length)}; the server accepts up to 1.5 MB of text per file.`;
    }
    if (target === "new") {
      const be = validBranch(newBranch.trim());
      if (be) errs.branch = be;
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;

    let changes: FileChange[];
    if (mode === "upload") changes = uploads.map((u) => ({ path: u.path, content: u.data, encoding: "base64" as const }));
    else {
      changes = [{ path: p, content: text }];
      if (mode === "edit" && p !== path) changes.push({ path, delete: true });
    }
    const msg = [message.trim() || defaultMsg, body.trim()].filter(Boolean).join("\n\n");

    let dest = branch;
    try {
      if (target === "new") {
        setStep("Creating branch…");
        dest = newBranch.trim();
        await api(`/repositories/${id}/branches`, { method: "POST", body: { name: dest, from_ref: branch } });
      }
      setStep("Committing…");
      const res = await commit.mutateAsync({
        branch: dest,
        message: msg,
        changes,
        // optimistic concurrency: refuse if the branch moved since this file was loaded
        expected_parent: target === "current" && mode === "edit" ? original.data?.commit : undefined,
      });
      toast({ tone: "ok", title: "Committed " + res.sha.slice(0, 7), body: `${msg.split("\n")[0]} → ${dest}` });
      setUploads([]);
      setContent(null);
      router.push(mode === "upload" ? treeHref(id, dest, dir) : blobHref(id, dest, p));
    } catch (err) {
      if (isApiError(err) && err.code === "branch_exists") setErrors({ branch: err.message });
      else if (!commit.error) setUploadErr(isApiError(err) ? err.message : "Something went wrong.");
    } finally {
      setStep(null);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]" noValidate>
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip h-7 px-2 font-mono text-[0.75rem]">
            <GitBranch aria-hidden /> {branch}
          </span>
          {mode === "upload" ? (
            <PathCrumbs repoId={id} repoName={repo.data.name} gitRef={branch} path={dir} />
          ) : (
            <div className="flex min-w-[16rem] flex-1 items-center gap-1.5">
              <span className="font-mono text-[0.8125rem] font-semibold text-fg-2">{repo.data.name} /</span>
              <label htmlFor="file-path" className="sr-only">File path</label>
              <input
                id="file-path"
                className="input h-8 flex-1 font-mono text-[0.8125rem]"
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                placeholder="path/to/file.ts"
                spellCheck={false}
                autoFocus={mode === "new"}
                aria-invalid={!!errors.path}
                aria-describedby={errors.path ? "path-err" : undefined}
              />
            </div>
          )}
        </div>
        {errors.path ? <p id="path-err" className="field-error !mt-0">{errors.path}</p> : null}

        {mode === "upload" ? (
          <div
            className="rounded-md border border-dashed border-stone-2 bg-deep px-6 py-10 text-center"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              addFiles(e.dataTransfer.files);
            }}
          >
            <FileUp className="mx-auto size-6 text-fg-3" aria-hidden />
            <p className="mt-3 text-sm font-semibold">Drop files here</p>
            <p className="mt-1 text-xs text-fg-2">Up to {MAX_FILES} files, 1 MB each. They&apos;re committed into {dir ? <code className="font-mono">{dir}/</code> : "the repository root"}.</p>
            <input type="file" multiple className="sr-only" id="upload-input" onChange={(e) => addFiles(e.target.files)} />
            <label htmlFor="upload-input" className="btn mt-4 cursor-pointer">
              <Upload aria-hidden /> Choose files
            </label>
            {uploads.length ? (
              <ul className="mx-auto mt-6 max-w-lg divide-y divide-line-soft rounded-md border border-line text-left">
                {uploads.map((u) => (
                  <li key={u.path} className="flex items-center gap-3 px-3 py-1.5 text-xs">
                    <span className="min-w-0 flex-1 truncate font-mono">{u.path}</span>
                    <span className="text-fg-3 tabular">{bytes(u.size)}</span>
                    <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label={`Remove ${u.path}`} onClick={() => setUploads((x) => x.filter((y) => y.path !== u.path))}>
                      <X />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : mode === "edit" && content === null ? (
          <div className="code-well space-y-2 rounded-md border border-line p-4">{Array.from({ length: 12 }, (_, i) => <Skeleton key={i} className="h-3.5" />)}</div>
        ) : (
          <div className="overflow-hidden rounded-md border border-line">
            <div className="flex items-center justify-between gap-3 border-b border-line bg-surface/50 px-3 py-1.5 text-2xs text-fg-3">
              <span className="flex items-center gap-1.5">
                <Pencil className="size-3" aria-hidden /> {dirty ? <span className="text-warn">Unsaved changes</span> : "No changes"}
              </span>
              <span id="editor-help">Tab indents · Esc then Tab leaves the editor · {bytes(text.length)}</span>
            </div>
            <CodeEditor id="editor" label={`Contents of ${name}`} value={text} onChange={setContent} />
          </div>
        )}
        {errors.content ? <p className="field-error">{errors.content}</p> : null}
      </div>

      <aside className="space-y-4 xl:sticky xl:top-[calc(var(--topbar-h)+1.5rem)] xl:self-start" aria-label="Commit changes">
        <h2 className="text-base font-bold">Commit changes</h2>
        <div>
          <label htmlFor="c-msg" className="label">Message</label>
          <input id="c-msg" className="input" placeholder={defaultMsg} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} />
        </div>
        <div>
          <label htmlFor="c-body" className="label">
            Description <span className="font-normal text-fg-3">(optional)</span>
          </label>
          <textarea id="c-body" rows={3} className="textarea" value={body} onChange={(e) => setBody(e.target.value)} maxLength={1400} />
        </div>
        <fieldset className="space-y-2">
          <legend className="label">Where</legend>
          <label className="radio-card !py-2.5">
            <input type="radio" name="target" checked={target === "current"} onChange={() => setTarget("current")} className="mt-0.5" />
            <span className="text-xs">
              Commit directly to <code className="font-mono font-semibold text-fg">{branch}</code>
            </span>
          </label>
          <label className="radio-card !py-2.5">
            <input type="radio" name="target" checked={target === "new"} onChange={() => setTarget("new")} className="mt-0.5" />
            <span className="flex-1 text-xs">
              <span className="flex items-center gap-1"><GitBranchPlus className="size-3.5 text-fg-3" aria-hidden /> Create a new branch</span>
              {target === "new" ? (
                <>
                  <label htmlFor="c-branch" className="sr-only">New branch name</label>
                  <input
                    id="c-branch"
                    className="input mt-2 h-8 font-mono text-xs"
                    placeholder="patch-1"
                    value={newBranch}
                    onChange={(e) => setNewBranch(e.target.value)}
                    aria-invalid={!!errors.branch}
                    autoFocus
                  />
                  {errors.branch ? <span className="field-error block">{errors.branch}</span> : null}
                </>
              ) : null}
            </span>
          </label>
        </fieldset>
        {commit.error ? <InlineError error={commit.error} /> : null}
        {uploadErr ? <p role="alert" className="text-xs text-err">{uploadErr}</p> : null}
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary h-9 flex-1" disabled={!dirty || !!step || commit.isPending || (mode === "upload" && !uploads.length)}>
            {step ? <><Spinner /> {step}</> : "Commit changes"}
          </button>
          <Link href={mode === "edit" ? blobHref(id, branch, path) : treeHref(id, branch, dir)} className="btn btn-ghost h-9">
            Cancel
          </Link>
        </div>
        {mode === "edit" ? (
          <p className="text-2xs text-fg-3">If someone commits to {branch} while you edit, Gitarchy refuses this commit instead of overwriting their work.</p>
        ) : null}
      </aside>

      <Dialog open={!!leaveTo} onClose={() => setLeaveTo(null)} title="Discard unsaved changes?" description="Your edits haven't been committed. Leaving this page throws them away.">
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => setLeaveTo(null)}>Keep editing</button>
          <button
            type="button"
            className="btn btn-danger-solid"
            onClick={() => {
              const to = leaveTo!;
              setLeaveTo(null);
              setContent(original.data?.content ?? "");
              setNewPath(path);
              setUploads([]);
              window.setTimeout(() => router.push(to), 0);
            }}
          >
            Discard
          </button>
        </div>
      </Dialog>
    </form>
  );
}

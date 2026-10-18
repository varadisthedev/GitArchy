"use client";

import { BookOpen, FileCode2, FilePlus2, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRepo, useTree, useFile } from "@/lib/api/queries";
import { atLeast } from "@/lib/api/types";
import { bytes, isSha, joinPath, parentPath } from "@/lib/format";
import { BranchPicker } from "@/components/repository/branch-picker";
import { GetCode } from "@/components/repository/get-code";
import { LastCommit } from "@/components/repository/last-commit";
import { Markdown } from "@/components/repository/markdown";
import { PathCrumbs } from "@/components/repository/path-crumbs";
import { blobHref, entryIcon, newFileHref, treeHref } from "@/components/repository/urls";
import { EmptyState, ErrorState, Skeleton, SkeletonRows } from "@/components/ui/states";
import { LanguagesCard } from "@/components/repository/languages-card";

export function CodeBrowser({ id, refParam, path }: { id: string; refParam?: string; path: string }) {
  const repo = useRepo(id);
  const router = useRouter();
  const ref = refParam || repo.data?.default_branch || "";
  const tree = useTree(id, ref, path);
  const canWrite = atLeast(repo.data?.role, "writer") && !isSha(ref);

  const readme = tree.data?.entries.find((e) => e.type === "file" && /^readme(\.md|\.markdown|\.txt)?$/i.test(e.name));

  if (!repo.data) return <SkeletonRows rows={8} label="Loading files" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <BranchPicker repoId={id} current={ref} canCreate={atLeast(repo.data.role, "writer")} onSelect={(r) => router.push(treeHref(id, r, path))} />
        <div className="order-last w-full min-w-0 px-1 sm:order-none sm:w-auto sm:flex-1">
          <PathCrumbs repoId={id} repoName={repo.data.name} gitRef={ref} path={path} />
        </div>
        <div className="ml-auto flex items-center gap-2">
          {canWrite ? (
            <>
              <Link href={`${newFileHref(id, ref, path)}&upload=1`} className="btn">
                <Upload aria-hidden /> <span className="hidden sm:inline">Upload</span>
              </Link>
              <Link href={newFileHref(id, ref, path)} className="btn">
                <FilePlus2 aria-hidden /> <span className="hidden sm:inline">Add file</span>
              </Link>
            </>
          ) : null}
          {!path ? <GetCode repoId={id} repoName={repo.data.name} /> : null}
        </div>
      </div>

      <section aria-label="Files" className="overflow-hidden rounded-md border border-line">
        <LastCommit repoId={id} gitRef={ref} path={path} />
        {tree.isPending ? <SkeletonRows rows={7} label="Loading files" /> : null}
        {tree.isError ? <ErrorState error={tree.error} retry={() => tree.refetch()} compact /> : null}
        {tree.isSuccess && !tree.data.entries.length ? (
          <EmptyState
            icon={<FileCode2 />}
            title={path ? "This folder is empty" : "This branch has no files"}
            compact
            action={
              canWrite ? (
                <Link href={newFileHref(id, ref, path)} className="btn btn-primary">
                  <FilePlus2 aria-hidden /> Add a file
                </Link>
              ) : null
            }
          >
            {canWrite ? "Create a file and commit it to get started." : "Nothing has been committed here yet."}
          </EmptyState>
        ) : null}
        {tree.data?.entries.length ? (
          <table className="data-table text-[0.84375rem]">
            <caption className="sr-only">Files in {path || "the repository root"}</caption>
            <thead className="sr-only">
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Size</th>
              </tr>
            </thead>
            <tbody>
              {path ? (
                <tr>
                  <td colSpan={2} className="!py-1.5">
                    <Link href={treeHref(id, ref, parentPath(path))} className="flex items-center gap-2.5 font-mono text-fg-2 hover:text-fg" aria-label="Parent folder">
                      <span className="w-4" />..
                    </Link>
                  </td>
                </tr>
              ) : null}
              {tree.data.entries.map((e) => {
                const Icon = entryIcon(e.name, e.type);
                const full = joinPath(path, e.name);
                const href = e.type === "dir" ? treeHref(id, ref, full) : blobHref(id, ref, full);
                return (
                  <tr key={e.name} className="relative">
                    <td className="!py-1.5">
                      {e.type === "submodule" ? (
                        <span className="flex items-center gap-2.5 text-fg-2" title="Git submodule (not browsable)">
                          <Icon className="size-4 flex-none text-fg-3" aria-hidden />
                          {e.name}
                        </span>
                      ) : (
                        <Link href={href} className="flex items-center gap-2.5 text-fg hover:underline">
                          <Icon className={`size-4 flex-none ${e.type === "dir" ? "text-stone" : "text-fg-3"}`} aria-hidden />
                          <span className="truncate">{e.name}</span>
                          {e.type === "symlink" ? <span className="chip h-4 text-[0.6875rem]">symlink</span> : null}
                        </Link>
                      )}
                    </td>
                    <td className="w-28 !py-1.5 text-right font-mono text-2xs text-fg-3">{e.type === "file" ? bytes(e.size) : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
      </section>

      {/* only at the repository root: a subdirectory's languages are not the repository's */}
      {!path ? <LanguagesCard repoId={id} /> : null}
      {readme ? <Readme repoId={id} gitRef={ref} dir={path} name={readme.name} /> : null}
    </div>
  );
}

function Readme({ repoId, gitRef, dir, name }: { repoId: string; gitRef: string; dir: string; name: string }) {
  const f = useFile(repoId, gitRef, joinPath(dir, name));
  return (
    <section aria-labelledby="readme-h" className="rounded-md border border-line">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <BookOpen className="size-4 text-fg-3" aria-hidden />
        <h2 id="readme-h" className="font-mono text-xs font-semibold">
          <Link href={blobHref(repoId, gitRef, joinPath(dir, name))} className="hover:underline">{name}</Link>
        </h2>
      </div>
      <div className="px-5 py-6 sm:px-8">
        {f.isPending ? (
          <div className="space-y-3"><Skeleton className="h-7 w-1/2" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-4/5" /></div>
        ) : f.isError ? (
          <ErrorState error={f.error} compact />
        ) : f.data?.encoding === "utf-8" ? (
          /\.(md|markdown)$/i.test(name) ? (
            <Markdown source={f.data.content} repoId={repoId} gitRef={gitRef} dir={dir} />
          ) : (
            <pre className="font-mono text-xs whitespace-pre-wrap text-fg-2">{f.data.content}</pre>
          )
        ) : (
          <p className="text-sm text-fg-3">This README isn&apos;t text.</p>
        )}
      </div>
    </section>
  );
}

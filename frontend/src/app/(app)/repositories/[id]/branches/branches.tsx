"use client";

import { FolderTree, GitBranch, GitBranchPlus, GitCompareArrows, History } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { isApiError } from "@/lib/api/client";
import { useBranches, useCreateBranch, useRepo } from "@/lib/api/queries";
import { atLeast } from "@/lib/api/types";
import { fullDate, relTime, shortSha } from "@/lib/format";
import { validBranch } from "@/lib/validation";
import { commitHref, commitsHref, treeHref } from "@/components/repository/urls";
import { useToast } from "@/components/ui/toast";
import { ErrorState, InlineError, SkeletonRows, Spinner } from "@/components/ui/states";

export function Branches({ id }: { id: string }) {
  const repo = useRepo(id);
  const branches = useBranches(id);
  const canWrite = atLeast(repo.data?.role, "writer");
  const def = repo.data?.default_branch;
  const list = (branches.data ?? []).toSorted((a, b) => Number(b.is_default) - Number(a.is_default) || b.updated_at.localeCompare(a.updated_at));

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <section aria-labelledby="br-h" className="min-w-0">
        <div className="mb-2 flex items-baseline justify-between border-b border-line pb-2">
          <h2 id="br-h" className="text-lg font-bold">Branches</h2>
          {branches.data ? <span className="text-2xs text-fg-3">{branches.data.length} total</span> : null}
        </div>
        {branches.isPending ? <SkeletonRows rows={4} label="Loading branches" /> : null}
        {branches.isError ? <ErrorState error={branches.error} retry={() => branches.refetch()} compact /> : null}
        {list.length ? (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[36rem]">
              <thead>
                <tr>
                  <th scope="col">Branch</th>
                  <th scope="col">Head</th>
                  <th scope="col">Updated</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {list.map((b) => (
                  <tr key={b.name}>
                    <td>
                      <Link href={treeHref(id, b.name)} className="inline-flex items-center gap-2 font-mono text-[0.8125rem] font-semibold hover:underline">
                        <GitBranch className="size-3.5 text-fg-3" aria-hidden /> {b.name}
                      </Link>
                      {b.is_default ? <span className="chip ml-2 border-stone-2 text-stone-hi">default</span> : null}
                    </td>
                    <td>
                      <Link href={commitHref(id, b.sha)} className="font-mono text-2xs text-stone-hi hover:underline">{shortSha(b.sha)}</Link>
                    </td>
                    <td className="text-2xs whitespace-nowrap text-fg-3">
                      <time dateTime={b.updated_at} title={fullDate(b.updated_at)}>{relTime(b.updated_at)}</time>
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <Link href={commitsHref(id, b.name)} className="btn btn-ghost btn-sm btn-icon" aria-label={`History of ${b.name}`} title="History">
                        <History />
                      </Link>
                      <Link href={treeHref(id, b.name)} className="btn btn-ghost btn-sm btn-icon" aria-label={`Browse ${b.name}`} title="Browse files">
                        <FolderTree />
                      </Link>
                      {!b.is_default && def ? (
                        <Link
                          href={`/repositories/${id}/compare?base=${encodeURIComponent(def)}&head=${encodeURIComponent(b.name)}`}
                          className="btn btn-ghost btn-sm btn-icon"
                          aria-label={`Compare ${b.name} with ${def}`}
                          title={`Compare with ${def}`}
                        >
                          <GitCompareArrows />
                        </Link>
                      ) : (
                        <span className="inline-block w-7" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <p className="mt-4 text-2xs text-fg-3">Branches come straight from Git. Deleting and renaming branches isn&apos;t supported by the server yet.</p>
      </section>

      {canWrite ? <NewBranch id={id} branches={list.map((b) => b.name)} defaultBranch={def} /> : null}
    </div>
  );
}

function NewBranch({ id, branches, defaultBranch }: { id: string; branches: string[]; defaultBranch?: string }) {
  const create = useCreateBranch(id);
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState("");
  const [from, setFrom] = useState("");
  const [err, setErr] = useState<string>();
  const source = from || defaultBranch || "";

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (create.isPending) return;
    const v = validBranch(name.trim()) ?? (branches.includes(name.trim()) ? "A branch with this name already exists." : undefined);
    setErr(v);
    if (v) return;
    try {
      const r = await create.mutateAsync({ name: name.trim(), from_ref: source });
      toast({ tone: "ok", title: `Created ${r.name}`, body: `From ${source} at ${shortSha(r.sha)}.` });
      setName("");
      router.push(treeHref(id, r.name));
    } catch (e) {
      if (isApiError(e) && e.status === 422) setErr(e.fieldError("name") ?? e.message);
    }
  }

  return (
    <aside aria-labelledby="nb-h" className="xl:pt-1">
      <h2 id="nb-h" className="flex items-center gap-2 text-base font-bold">
        <GitBranchPlus className="size-4 text-fg-3" aria-hidden /> New branch
      </h2>
      <form onSubmit={submit} noValidate className="mt-3 space-y-3">
        <div>
          <label htmlFor="nb-name" className="label">Name</label>
          <input id="nb-name" className="input font-mono text-[0.8125rem]" value={name} onChange={(e) => setName(e.target.value)} placeholder="feature/search" spellCheck={false} autoComplete="off" aria-invalid={!!err} aria-describedby={err ? "nb-err" : undefined} />
          {err ? <p id="nb-err" className="field-error">{err}</p> : null}
        </div>
        <div>
          <label htmlFor="nb-from" className="label">From</label>
          <select id="nb-from" className="select font-mono text-[0.8125rem]" value={source} onChange={(e) => setFrom(e.target.value)}>
            {branches.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        {create.error && !(isApiError(create.error) && create.error.status === 422) ? <InlineError error={create.error} /> : null}
        <button type="submit" className="btn btn-primary w-full" disabled={create.isPending || !source}>
          {create.isPending ? <><Spinner /> Creating…</> : "Create branch"}
        </button>
      </form>
    </aside>
  );
}

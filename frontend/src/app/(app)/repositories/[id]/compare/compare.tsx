"use client";

import { ArrowLeftRight, MoveLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useDiff, useRepo } from "@/lib/api/queries";
import { DiffView } from "@/components/git/diff-view";
import { BranchPicker } from "@/components/repository/branch-picker";
import { ErrorState, Skeleton } from "@/components/ui/states";

export function Compare({ id, base: baseParam, head: headParam }: { id: string; base?: string; head?: string }) {
  const repo = useRepo(id);
  const router = useRouter();
  const base = baseParam || repo.data?.default_branch;
  const head = headParam || repo.data?.default_branch;
  const same = !!base && base === head;
  const diff = useDiff(id, same ? undefined : base, same ? undefined : head);
  const go = (b?: string, h?: string) =>
    router.push(`/repositories/${id}/compare?base=${encodeURIComponent(b ?? "")}&head=${encodeURIComponent(h ?? "")}`);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold">Compare changes</h2>
        <p className="mt-1 text-sm text-fg-2">Pick a base and the branch or commit to compare against it. The diff shows what the right side adds.</p>
      </div>
      {base && head ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface/40 px-3 py-2.5">
          <span className="text-2xs font-semibold text-fg-3">base</span>
          <BranchPicker repoId={id} current={base} canCreate={false} label="Base" onSelect={(b) => go(b, head)} />
          <MoveLeft className="size-4 text-fg-3" aria-hidden />
          <span className="text-2xs font-semibold text-fg-3">compare</span>
          <BranchPicker repoId={id} current={head} canCreate={false} label="Compare" onSelect={(h) => go(base, h)} />
          <button className="btn btn-ghost btn-sm ml-auto" onClick={() => go(head, base)}>
            <ArrowLeftRight aria-hidden /> Swap
          </button>
        </div>
      ) : (
        <Skeleton className="h-12" />
      )}
      {same ? (
        <p className="rounded-md border border-line px-4 py-6 text-sm text-fg-2">
          Base and compare are the same. Choose a different branch on either side to see a diff.
        </p>
      ) : null}
      {diff.isPending && !same && base ? <Skeleton className="h-64" /> : null}
      {diff.isError ? <ErrorState error={diff.error} retry={() => diff.refetch()} compact /> : null}
      {diff.data ? <DiffView diff={diff.data} /> : null}
    </div>
  );
}

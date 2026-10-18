"use client";

import { Check, ChevronDown, GitBranch, GitBranchPlus, GitCommitHorizontal } from "lucide-react";
import { useState } from "react";
import { useBranches, useCreateBranch } from "@/lib/api/queries";
import { isSha, shortSha } from "@/lib/format";
import { validBranch } from "@/lib/validation";
import { Popover } from "@/components/ui/popover";
import { InlineError, Spinner } from "@/components/ui/states";

export function BranchPicker({
  repoId,
  current,
  onSelect,
  canCreate,
  label = "Switch branch",
}: {
  repoId: string;
  current: string;
  onSelect: (ref: string) => void;
  canCreate: boolean;
  label?: string;
}) {
  const branches = useBranches(repoId);
  const create = useCreateBranch(repoId);
  const [q, setQ] = useState("");
  const name = q.trim();
  const list = (branches.data ?? [])
    .filter((b) => b.name.toLowerCase().includes(name.toLowerCase()))
    .toSorted((a, b) => Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name));
  const exact = branches.data?.some((b) => b.name === name);
  const invalid = name ? validBranch(name) : undefined;
  const commitMode = isSha(current) && !branches.data?.some((b) => b.name === current);

  return (
    <Popover
      label={`${label}: ${current}`}
      buttonClassName="btn max-w-[16rem]"
      className="menu w-[19rem] p-0"
      onOpen={() => {
        setQ("");
        create.reset();
      }}
      button={
        <>
          {commitMode ? <GitCommitHorizontal aria-hidden /> : <GitBranch aria-hidden />}
          <span className="truncate font-mono text-[0.78rem]">{commitMode ? shortSha(current) : current}</span>
          <ChevronDown className="!size-3.5 text-fg-3" aria-hidden />
        </>
      }
    >
      {(close) => (
        <div>
          <div className="border-b border-[#474545] p-2">
            <label htmlFor={`bf-${repoId}`} className="sr-only">Find or create a branch</label>
            <input
              id={`bf-${repoId}`}
              data-autofocus
              className="input h-8 text-xs"
              placeholder={canCreate ? "Find or create a branch" : "Find a branch"}
              value={q}
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => {
                setQ(e.target.value);
                create.reset();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && list[0]) {
                  e.preventDefault();
                  onSelect(list[0].name);
                  close();
                }
              }}
            />
          </div>
          <div className="max-h-[18rem] overflow-auto p-1">
            {branches.isPending ? <p className="px-2.5 py-2 text-xs text-fg-3">Loading branches…</p> : null}
            {branches.isError ? <p className="px-2.5 py-2 text-xs text-err">Couldn&apos;t load branches.</p> : null}
            {list.map((b) => (
              <button
                key={b.name}
                className="menu-item"
                onClick={() => {
                  onSelect(b.name);
                  close();
                }}
              >
                {b.name === current ? <Check aria-hidden className="!text-stone-hi" /> : <span className="w-[15px]" />}
                <span className="min-w-0 flex-1 truncate font-mono text-[0.78rem]">{b.name}</span>
                {b.is_default ? <span className="chip h-[1.125rem] text-[0.6875rem]">default</span> : null}
              </button>
            ))}
            {branches.isSuccess && !list.length && !name ? <p className="px-2.5 py-2 text-xs text-fg-3">No branches.</p> : null}
            {branches.isSuccess && !list.length && name && !canCreate ? <p className="px-2.5 py-2 text-xs text-fg-3">No branch matches.</p> : null}
          </div>
          {canCreate && name && !exact ? (
            <div className="border-t border-[#474545] p-1">
              <button
                className="menu-item"
                disabled={!!invalid || create.isPending}
                onClick={async () => {
                  try {
                    await create.mutateAsync({ name, from_ref: current });
                    onSelect(name);
                    close();
                  } catch {}
                }}
              >
                {create.isPending ? <Spinner /> : <GitBranchPlus aria-hidden />}
                <span className="min-w-0 flex-1">
                  Create <span className="font-mono font-semibold">{name}</span>{" "}
                  <span className="text-fg-3">from {isSha(current) ? shortSha(current) : current}</span>
                </span>
              </button>
              {invalid ? <p className="px-2.5 pb-2 text-2xs text-err">{invalid}</p> : null}
              {create.error ? <div className="px-2.5 pb-2"><InlineError error={create.error} /></div> : null}
            </div>
          ) : null}
        </div>
      )}
    </Popover>
  );
}

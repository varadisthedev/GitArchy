"use client";

import { ChevronDown, Download, PackageCheck } from "lucide-react";
import { useExportRepo, useReady } from "@/lib/api/queries";
import { bytes } from "@/lib/format";
import { Popover } from "@/components/ui/popover";
import { InlineError, Spinner } from "@/components/ui/states";

// The backend has no git-over-HTTP transport, so there's no clone URL to show. What it does offer is a
// verified `git bundle` export stored in R2, and that is what this menu exposes.
export function GetCode({ repoId, repoName }: { repoId: string; repoName: string }) {
  const ready = useReady();
  const exp = useExportRepo(repoId);
  const r2 = ready.data?.optional.r2;

  return (
    <Popover
      button={<><Download aria-hidden /> Get code <ChevronDown className="!size-3.5 text-fg-3" aria-hidden /></>}
      align="end"
      className="menu w-[22rem] max-w-[calc(100vw-1rem)] p-3.5"
      onOpen={() => exp.reset()}
    >
      {() => (
        <div className="space-y-3">
          <div>
            <h2 className="text-sm font-bold">Download a Git bundle</h2>
            <p className="mt-1 text-xs text-fg-2">
              A complete, verified copy of every branch and commit. Gitarchy doesn&apos;t serve <code className="font-mono text-[0.75rem]">git clone</code> over
              HTTP. Clone from the bundle instead:
            </p>
          </div>
          <pre className="overflow-x-auto rounded-md bg-deep px-3 py-2 font-mono text-[0.75rem] text-fg">git clone {repoName}.bundle {repoName}</pre>
          {r2 === false ? (
            <p className="text-xs text-fg-3">Bundle export isn&apos;t configured on this server (no object storage).</p>
          ) : exp.data ? (
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-xs text-ok">
                <PackageCheck className="size-3.5" aria-hidden /> Bundle ready · {bytes(exp.data.size)}
              </p>
              <a href={exp.data.download_url} download={`${repoName}.bundle`} className="btn btn-primary w-full">
                <Download aria-hidden /> Download {repoName}.bundle
              </a>
              <p className="font-mono text-[0.6875rem] break-all text-fg-3">sha256 {exp.data.sha256}</p>
              <p className="text-2xs text-fg-3">The link expires in {Math.round(exp.data.expires_in / 60)} minutes.</p>
            </div>
          ) : (
            <button className="btn w-full" disabled={exp.isPending || r2 === undefined} onClick={() => exp.mutate()}>
              {exp.isPending ? <><Spinner /> Packing bundle…</> : "Create bundle"}
            </button>
          )}
          {exp.error ? <InlineError error={exp.error} /> : null}
        </div>
      )}
    </Popover>
  );
}

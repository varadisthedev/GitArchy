"use client";

import { useReady } from "@/lib/api/queries";

/**
 * Object storage health from GET /ready (polled). Unlike the other optional integrations this one is
 * really probed server-side (HEAD on the bucket, cached), so "connected" means connected, not configured.
 */
export function StorageStatus() {
  const ready = useReady();
  if (ready.isError) return <span className="text-2xs text-fg-3">Storage status unavailable</span>;
  if (!ready.data) return <span className="skel inline-block h-4 w-40" />;
  const [dot, text] = (
    {
      ok: ["bg-ok", "Object storage connected"],
      off: ["bg-fg-4", "Object storage not configured"],
      unavailable: ["border border-err", "Object storage unreachable"],
    } as const
  )[ready.data.optional.r2];
  return (
    <span role="status" className="inline-flex items-center gap-2 text-xs text-fg-2">
      <span aria-hidden className={`size-2 rounded-full ${dot}`} />
      {text}
    </span>
  );
}

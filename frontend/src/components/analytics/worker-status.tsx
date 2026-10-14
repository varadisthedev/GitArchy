"use client";

import { useReady } from "@/lib/api/queries";

/** Spark worker presence from GET /ready (polled). The worker dials the API, never the browser. */
export function WorkerStatus() {
  const ready = useReady();
  if (ready.isError) return <span className="text-2xs text-fg-3">Worker status unavailable</span>;
  if (!ready.data) return <span className="skel inline-block h-4 w-36" />;
  const { analytics_enabled: on, spark_worker_connected: up } = ready.data.optional;
  const [dot, text] = !on
    ? ["bg-fg-4", "Analytics disabled"]
    : up
      ? ["bg-ok", "Spark worker connected"]
      : ["border border-warn", "No worker connected"];
  return (
    <span role="status" className="inline-flex items-center gap-2 text-xs text-fg-2">
      <span aria-hidden className={`size-2 rounded-full ${dot}`} />
      {text}
    </span>
  );
}

import { CircleCheck, CircleDashed, CircleSlash, CircleX, Globe, Hourglass, Loader, Lock, Send } from "lucide-react";
import type { JobStatus, Role, Visibility } from "@/lib/api/types";
import { initials } from "@/lib/format";

export function Avatar({ name, url, size = 28 }: { name: string; url?: string | null; size?: number }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element -- Cloudinary URL, already sized/optimized at the CDN
    return <img src={url} alt="" width={size} height={size} className="flex-none rounded-full bg-surface object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span
      aria-hidden
      className="inline-flex flex-none items-center justify-center rounded-full border border-line bg-surface font-bold text-fg-2"
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.38) }}
    >
      {initials(name)}
    </span>
  );
}

export function VisibilityChip({ v }: { v: Visibility }) {
  return (
    <span className="chip">
      {v === "private" ? <Lock aria-hidden /> : <Globe aria-hidden />}
      {v === "private" ? "Private" : "Public"}
    </span>
  );
}

export function RoleChip({ role }: { role: Role }) {
  return <span className={`chip ${role === "owner" ? "border-stone-2 text-stone-hi" : ""}`}>{role[0].toUpperCase() + role.slice(1)}</span>;
}

export const JOB_TONE: Record<JobStatus, "idle" | "info" | "warn" | "ok" | "err"> = {
  queued: "idle",
  dispatched: "info",
  running: "warn",
  succeeded: "ok",
  failed: "err",
  cancelled: "idle",
};

const JOB_ICON = { queued: Hourglass, dispatched: Send, running: Loader, succeeded: CircleCheck, failed: CircleX, cancelled: CircleSlash };
const TONE_CLASS = { idle: "text-fg-2", info: "text-info", warn: "text-warn", ok: "text-ok", err: "text-err" };

export function JobStatusChip({ status, waiting }: { status: JobStatus; waiting?: boolean }) {
  if (waiting) {
    return (
      <span className="chip text-fg-2">
        <CircleDashed aria-hidden /> Waiting for worker
      </span>
    );
  }
  const Icon = JOB_ICON[status];
  return (
    <span className={`chip ${TONE_CLASS[JOB_TONE[status]]}`}>
      <Icon aria-hidden className={status === "running" ? "animate-spin [animation-duration:2.4s]" : ""} />
      {status[0].toUpperCase() + status.slice(1)}
    </span>
  );
}

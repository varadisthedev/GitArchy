"use client";

import { TriangleAlert } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { isApiError } from "@/lib/api/client";

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`skel ${className}`} />;
}

/** Rows of skeleton lines shaped like the table they stand in for. */
export function SkeletonRows({ rows = 6, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="divide-y divide-line-soft">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2.5">
          <Skeleton className="size-4" />
          <Skeleton className="h-3.5" />
          <Skeleton className="ml-auto h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

// unDraw illustrations (undraw.co/license), recolored to the stone palette; files live in /public/illustrations.
export type Art =
  | "no-repos" | "empty-repo" | "no-commits" | "not-found" | "server-error" | "offline" | "no-jobs"
  | "no-activity" | "no-matches" | "no-access" | "signed-out" | "error";

export function Illustration({ art, className = "h-36" }: { art: Art; className?: string }) {
  return <Image src={`/illustrations/${art}.svg`} alt="" aria-hidden width={240} height={160} className={`w-auto max-w-full ${className}`} />;
}

export function EmptyState({
  icon,
  art,
  title,
  children,
  action,
  compact = false,
}: {
  icon?: ReactNode;
  art?: Art;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-start ${compact ? "px-4 py-6" : "px-6 py-10"}`}>
      {art ? (
        <Illustration art={art} className={`mb-5 ${compact ? "h-24" : "h-36"}`} />
      ) : icon ? (
        <div className="mb-3 text-fg-3 [&_svg]:size-5">{icon}</div>
      ) : null}
      <h3 className="text-base font-bold">{title}</h3>
      {children ? <div className="mt-1 max-w-[56ch] text-sm text-fg-2">{children}</div> : null}
      {action ? <div className="mt-4 flex flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}

/** Maps a failed request to an explanation and a recovery path. */
export function ErrorState({ error, retry, compact }: { error: unknown; retry?: () => void; compact?: boolean }) {
  const e = isApiError(error) ? error : null;
  let art: Art = "error";
  let title = "Something went wrong";
  let body: ReactNode = e?.message ?? "An unexpected error occurred.";
  let action: ReactNode = retry ? (
    <button className="btn" onClick={retry}>
      Try again
    </button>
  ) : null;

  if (e?.status === 0) {
    art = "offline";
    title = "Can't reach the server";
  } else if (e?.status === 404) {
    art = "not-found";
    title = "Not found";
    body = e.code === "not_found" || e.code === "http_error"
      ? "It doesn't exist, or it's private and you're not a member."
      : e.message;
    action = (
      <Link href="/repositories" className="btn">
        Back to repositories
      </Link>
    );
  } else if (e?.status === 403) {
    art = "no-access";
    title = "You don't have access";
  } else if (e?.status === 401) {
    art = "signed-out";
    title = "Session ended";
    body = "Sign in again to continue.";
  } else if (e?.code === "repo_storage_unavailable") {
    art = "server-error";
    title = "Repository storage unavailable";
  } else if (e?.status === 503) {
    art = "server-error";
    title = "Unavailable on this server";
  }

  return (
    <div role="alert">
      <EmptyState art={art} title={title} action={action} compact={compact}>
        {body}
        {e?.requestId && e.status >= 500 ? (
          <p className="mt-2 font-mono text-2xs text-fg-3">request {e.requestId}</p>
        ) : null}
      </EmptyState>
    </div>
  );
}

/** Inline banner for a failed mutation, placed next to the control that caused it. */
export function InlineError({ error }: { error: unknown }) {
  if (!error) return null;
  const msg = isApiError(error) ? error.message : "Something went wrong.";
  return (
    <p role="alert" className="flex items-start gap-2 text-xs text-err">
      <TriangleAlert className="mt-0.5 size-3.5 flex-none" aria-hidden />
      <span>{msg}</span>
    </p>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        {children}
        <h1 className="text-2xl font-bold tracking-[-0.02em]">{title}</h1>
        {description ? <p className="mt-1 max-w-[70ch] text-sm text-fg-2">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Spinner({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.6" />
      <path d="M14.5 8A6.5 6.5 0 0 0 8 1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

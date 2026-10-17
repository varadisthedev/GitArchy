"use client";

import { useState } from "react";
import { isApiError } from "@/lib/api/client";
import { useGithubOAuthStart, useGithubStatus } from "@/lib/api/queries";
import { InlineError, Spinner } from "@/components/ui/states";

/** GitHub's mark. Inline because it is the one brand asset that must look exactly right. */
export function GithubMark({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={className} fill="currentColor">
      <path d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38l-.01-1.49c-2.23.48-2.7-1.07-2.7-1.07-.36-.93-.89-1.18-.89-1.18-.73-.5.05-.49.05-.49.8.06 1.23.83 1.23.83.71 1.22 1.87.87 2.33.67.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48l-.01 2.2c0 .21.14.46.55.38A8 8 0 0 0 8 0Z" />
    </svg>
  );
}

/**
 * Sends the browser to GitHub. `mode` "signin" creates or finds an account; "connect" links GitHub
 * to the account already signed in. The authorize URL is built server-side so the client never holds
 * the client id or the signed state.
 */
export function GithubButton({
  mode = "signin",
  next,
  label,
  className = "btn h-9 w-full",
}: {
  mode?: "signin" | "connect";
  next?: string;
  label?: string;
  className?: string;
}) {
  const status = useGithubStatus();
  const start = useGithubOAuthStart();
  const [leaving, setLeaving] = useState(false);

  // signin is used on anonymous pages where /github/status would 401; only gate on a definite "off"
  if (mode === "connect" && status.data && !status.data.configured) return null;

  async function go() {
    setLeaving(true);
    try {
      const { authorize_url } = await start.mutateAsync({ mode, next });
      window.location.assign(authorize_url); // full navigation: GitHub owns the next screen
    } catch {
      setLeaving(false); // the error renders below; staying put lets them retry
    }
  }

  const unavailable = isApiError(start.error) && start.error.code === "integration_not_configured";
  return (
    <div className="space-y-2">
      <button type="button" className={className} onClick={go} disabled={leaving || unavailable}>
        {leaving ? <Spinner /> : <GithubMark />}
        {leaving ? "Redirecting to GitHub…" : (label ?? "Continue with GitHub")}
      </button>
      {start.error ? <InlineError error={start.error} /> : null}
    </div>
  );
}

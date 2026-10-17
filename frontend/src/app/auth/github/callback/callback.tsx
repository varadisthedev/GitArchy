"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { isApiError } from "@/lib/api/client";
import { takeOAuthNonce, useGithubOAuthCallback } from "@/lib/api/queries";
import { useSession } from "@/lib/auth/session";
import { Spinner } from "@/components/ui/states";

// Same rule as the login form: only same-origin paths may be used as a redirect target.
const safeNext = (n?: string | null) => {
  if (!n?.startsWith("/")) return null;
  try {
    const u = new URL(n, "http://same.invalid");
    return u.origin === "http://same.invalid" ? u.pathname + u.search + u.hash : null;
  } catch {
    return null;
  }
};

export function GithubCallback() {
  const params = useSearchParams();
  const router = useRouter();
  const { adopt } = useSession();
  const exchange = useGithubOAuthCallback();
  const started = useRef(false);

  const code = params.get("code");
  const state = params.get("state");
  const denied = params.get("error");

  // whether the URL itself is unusable is plain derived state, so it needs no effect and no setState
  const urlProblem = denied
    ? denied === "access_denied"
      ? "You cancelled the GitHub authorization, so nothing was connected."
      : `GitHub refused the authorization (${denied}).`
    : !code || !state
      ? "This page is missing GitHub's response. Start the sign-in again."
      : null;

  useEffect(() => {
    // an authorization code is single-use: React may run this effect twice, the exchange must not
    if (urlProblem || started.current) return;
    started.current = true;
    exchange
      .mutateAsync({ code: code!, state: state!, nonce: takeOAuthNonce() })
      .then((r) => {
        const next = safeNext(r.next);
        if (r.mode === "signin" && r.token) {
          adopt(r.token);
          router.replace(next ?? "/dashboard");
        } else {
          router.replace(next ?? "/import/github?connected=1");
        }
      })
      .catch(() => {
        /* rendered from exchange.error below */
      });
    // run exactly once, on mount, with whatever GitHub put in the URL
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const error = urlProblem ?? (exchange.error ? (isApiError(exchange.error) ? exchange.error.message : "Something went wrong.") : null);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      {error ? (
        <div role="alert">
          <h1 className="text-xl font-bold tracking-[-0.02em]">GitHub sign-in didn&apos;t finish</h1>
          <p className="mt-2 text-sm text-fg-2">{error}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/login" className="btn btn-primary h-9">
              Back to sign in
            </Link>
            <Link href="/dashboard" className="btn h-9">
              Go to dashboard
            </Link>
          </div>
        </div>
      ) : (
        <p role="status" className="flex items-center gap-2.5 text-sm text-fg-2">
          <Spinner /> Finishing up with GitHub…
        </p>
      )}
    </div>
  );
}

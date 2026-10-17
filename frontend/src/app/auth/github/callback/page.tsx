import type { Metadata } from "next";
import { Suspense } from "react";
import { GithubCallback } from "./callback";

export const metadata: Metadata = { title: "Finishing GitHub sign-in", robots: { index: false } };

/** Where GitHub sends the browser back. GITHUB_OAUTH_REDIRECT_URI must point exactly here.
 *  The page reads ?code/?state, so it can only render in the browser: Suspense lets the static
 *  shell prerender and the URL-dependent part stream in. */
export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-dvh" role="status" aria-label="Finishing GitHub sign-in" />}>
      <GithubCallback />
    </Suspense>
  );
}

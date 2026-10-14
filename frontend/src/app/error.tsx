"use client";

import { useEffect } from "react";
import { Illustration } from "@/components/ui/states";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="grid min-h-[60dvh] place-items-center px-6">
      <div role="alert" className="max-w-md">
        <Illustration art="error" className="mb-8 h-36" />
        <h1 className="text-2xl font-bold tracking-[-0.02em]">This screen hit an error</h1>
        <p className="mt-2 text-sm text-fg-2">Something in the page failed to render. Your data on the server is unaffected.</p>
        {error.digest ? <p className="mt-2 font-mono text-2xs text-fg-3">ref {error.digest}</p> : null}
        <button className="btn btn-primary mt-6" onClick={reset}>Try again</button>
      </div>
    </main>
  );
}

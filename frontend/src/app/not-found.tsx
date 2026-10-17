import { FileQuestion } from "lucide-react";
import Link from "next/link";
import { Wordmark } from "@/components/layout/logo";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="max-w-md">
        <Wordmark />
        <div aria-hidden className="mt-10 grid size-10 place-items-center rounded-md border border-line bg-surface text-fg-3">
          <FileQuestion className="size-5" />
        </div>
        <h1 className="mt-7 text-3xl font-bold tracking-[-0.02em]">This page doesn&apos;t exist</h1>
        <p className="mt-2 text-sm text-fg-2">The link may be mistyped, or what it pointed to was moved or deleted.</p>
        <div className="mt-6 flex gap-2">
          <Link href="/dashboard" className="btn btn-primary">Go to your workspace</Link>
          <Link href="/" className="btn">Home</Link>
        </div>
      </div>
    </main>
  );
}

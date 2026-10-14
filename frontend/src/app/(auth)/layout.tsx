import Link from "next/link";
import { Suspense } from "react";
import { Wordmark } from "@/components/layout/logo";

const FLOW = [
  { t: "Create a repository", d: "A bare Git repository with a first commit, owned by you." },
  { t: "Commit from the browser", d: "Edit files, branch, and review diffs. Real Git underneath." },
  { t: "Queue a Spark job", d: "Commit activity, message terms, file stats, K-Means, logistic regression." },
  { t: "Read the result", d: "Progress streams live. Results link back to the code they describe." },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)]">
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <Link href="/" className="self-start rounded-sm" aria-label="Gitarchy home">
          <Wordmark />
        </Link>
        <main className="mx-auto flex w-full max-w-[23rem] flex-1 flex-col justify-center py-12">
          <Suspense>{children}</Suspense>
        </main>
      </div>
      <aside aria-label="How Gitarchy works" className="hidden border-l border-line bg-shell px-12 py-16 lg:flex lg:flex-col lg:justify-center">
        <p className="max-w-[24ch] text-2xl leading-tight font-bold tracking-[-0.02em]">
          Your history is data. Gitarchy hosts it and runs Spark on it.
        </p>
        <ol className="spine mt-10">
          {FLOW.map((s, i) => (
            <li key={s.t} className="pb-6">
              <span className="spine-node" data-tone={i === FLOW.length - 1 ? "ok" : i === 2 ? "warn" : "solid"} />
              <p className="pt-1.5 text-sm font-bold">{s.t}</p>
              <p className="mt-0.5 text-xs text-fg-2">{s.d}</p>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}

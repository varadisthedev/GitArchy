import { GitBranch, GitCommitHorizontal, KeyRound, Radio } from "lucide-react";
import Link from "next/link";
import { LandingCta } from "@/components/landing/landing-cta";
import { ProductPreview } from "@/components/landing/product-preview";
import { Wordmark } from "@/components/layout/logo";
import { TASKS } from "@/lib/analytics";

const PILLARS = [
  {
    icon: GitCommitHorizontal,
    title: "Real Git, in the browser",
    body: "Every repository is a bare Git repository. Browse trees at any branch or commit, edit and commit files, branch, and read diffs. Commits are built by Git itself, byte for byte.",
  },
  {
    icon: Radio,
    title: "Spark on the same history",
    body: "Queue a job against your repositories and watch it go from queued to running to a result, streamed live. If no worker is connected, the job waits in the queue.",
  },
  {
    icon: KeyRound,
    title: "Access you can reason about",
    body: "Readers, writers, admins, an owner. Private repositories look like they don't exist to anyone outside them. Signing out revokes the session on the server.",
  },
  {
    icon: GitBranch,
    title: "Your history, portable",
    body: "Export any repository as a verified Git bundle with every branch, then clone it anywhere with plain git. There's no lock-in.",
  },
];

const DIFF: [" " | "+" | "-", string][] = [
  [" ", "def fee(amount: Decimal) -> Decimal:"],
  ["-", '    return amount * Decimal("0.029") + Decimal("0.30")'],
  ["+", '    raw = amount * Decimal("0.029") + Decimal("0.30")'],
  ["+", '    return raw.quantize(Decimal("0.01"), ROUND_HALF_EVEN)'],
  [" ", ""],
  [" ", "class Ledger:"],
];

export default function Landing() {
  return (
    <div className="min-h-dvh overflow-x-clip">
      <header className="mx-auto flex h-16 max-w-[84rem] items-center gap-6 px-5 sm:px-8">
        <Link href="/" aria-label="Gitarchy home" className="rounded-sm">
          <Wordmark size={24} textClass="text-[1.1875rem]" />
        </Link>
        <nav aria-label="Sections" className="hidden gap-5 text-xs font-semibold text-fg-2 md:flex">
          <a href="#how" className="hover:text-fg">How it works</a>
          <a href="#analytics" className="hover:text-fg">Analytics</a>
        </nav>
        <div className="ml-auto">
          <LandingCta size="sm" variant="nav" />
        </div>
      </header>

      <main>
        <section className="mx-auto grid grid-cols-1 max-w-[84rem] items-center gap-x-14 gap-y-14 px-5 pt-14 pb-24 sm:px-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:pt-20">
          <div>
            <h1 className="text-[clamp(2.6rem,5.6vw,4.6rem)] leading-[0.98] font-[780] tracking-[-0.035em]">
              Host the code.
              <br />
              <span className="text-stone-hi">Query the history.</span>
            </h1>
            <p className="mt-6 max-w-[34rem] text-[1.0625rem] leading-relaxed text-fg-2">
              Gitarchy is a Git host with Apache Spark built in. Read, commit and diff in the browser, then run distributed
              analytics over the same commits and watch the result arrive.
            </p>
            <div className="mt-9">
              <LandingCta />
            </div>
            <p className="mt-5 text-xs text-fg-3">Sign up with an email and a password. Your repositories start private.</p>
          </div>
          <ProductPreview />
        </section>

        <section id="how" aria-labelledby="how-h" className="border-t border-line bg-shell">
          <div className="mx-auto max-w-[84rem] px-5 py-20 sm:px-8">
            <div className="grid grid-cols-1 gap-x-14 gap-y-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div>
                <h2 id="how-h" className="max-w-[22ch] text-[clamp(1.75rem,3vw,2.5rem)] leading-tight font-bold tracking-[-0.025em]">
                  One place for the repository and what it says about your team.
                </h2>
                <ol className="spine mt-10">
                  {PILLARS.map((p, i) => (
                    <li key={p.title} className="pb-7 last:pb-0">
                      <span className="spine-node" data-tone={i === 1 ? "warn" : "solid"} />
                      <h3 className="flex items-center gap-2 pt-0.5 text-lg font-bold">
                        <p.icon className="size-4 text-stone" aria-hidden /> {p.title}
                      </h3>
                      <p className="mt-1.5 max-w-[52ch] text-sm leading-relaxed text-fg-2">{p.body}</p>
                    </li>
                  ))}
                </ol>
              </div>
              <figure className="min-w-0 self-center" aria-labelledby="diff-cap">
                <div className="overflow-hidden rounded-md border border-line">
                  <div className="flex items-center gap-3 border-b border-line bg-canvas px-4 py-2.5 text-xs">
                    <span className="font-semibold">Fix rounding in fee calculation</span>
                    <span className="ml-auto font-mono text-2xs text-stone-hi">41ab7d0</span>
                  </div>
                  <div className="flex items-center gap-3 border-b border-line-soft bg-shell px-4 py-2 font-mono text-[0.75rem]">
                    <span>src/ledger.py</span>
                    <span className="ml-auto"><span className="text-ok">+2</span> <span className="text-err">−1</span></span>
                  </div>
                  <pre className="code-well overflow-x-auto py-2 text-[0.75rem] leading-6">
{DIFF.map(([k, t], i) => (
  <div key={i} className={k === "+" ? "bg-[var(--add-bg)]" : k === "-" ? "bg-[var(--del-bg)]" : ""}>
    <span className={`inline-block w-8 text-center select-none ${k === "+" ? "text-ok" : k === "-" ? "text-err" : "text-fg-4"}`}>{k}</span>
    <span className="text-fg">{t}</span>
  </div>
))}
                  </pre>
                  <div className="flex items-center gap-2 border-t border-line bg-canvas px-4 py-2.5 text-2xs text-fg-2">
                    <span aria-hidden className="size-2 flex-none rounded-full border border-ok" />
                    <p className="min-w-0">
                      Counted by the next <span className="font-semibold text-fg">Bug-fix classifier</span> run as a fix commit
                    </p>
                  </div>
                </div>
                <figcaption id="diff-cap" className="mt-3 flex flex-wrap items-center gap-2 text-2xs text-fg-3">
                  <span className="chip">Sample data</span> A commit diff as Gitarchy shows it, linked to the analytics that read it.
                </figcaption>
              </figure>
            </div>
          </div>
        </section>

        <section id="analytics" aria-labelledby="an-h" className="mx-auto max-w-[84rem] px-5 py-20 sm:px-8">
          <div className="grid grid-cols-1 gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div>
              <h2 id="an-h" className="text-[clamp(1.75rem,3vw,2.5rem)] leading-tight font-bold tracking-[-0.025em]">
                Five Spark jobs, one click from your code.
              </h2>
              <p className="mt-4 max-w-[44ch] text-sm leading-relaxed text-fg-2">
                Each operation is a fixed, parameter-checked Spark program. No code is uploaded and nothing runs that the
                worker doesn&apos;t already know. The worker dials into Gitarchy, so it can live on a laptop or a Colab notebook.
              </p>
            </div>
            <ol className="spine">
              {TASKS.map((t, i) => (
                <li key={t.type} className="border-b border-line-soft pt-1 pb-5 last:border-b-0">
                  <span className="spine-node" data-tone={i === TASKS.length - 1 ? "ok" : "solid"} />
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h3 className="text-base font-bold">{t.title}</h3>
                    <span className="font-mono text-2xs text-fg-3">{t.spark}</span>
                  </div>
                  <p className="mt-1 text-sm text-fg-2">{t.summary}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="cta-h" className="border-t border-line">
          <div className="mx-auto flex max-w-[84rem] flex-wrap items-center justify-between gap-6 px-5 py-16 sm:px-8">
            <h2 id="cta-h" className="text-[clamp(1.5rem,2.6vw,2.125rem)] leading-tight font-bold tracking-[-0.02em]">
              Create a repository. Commit something. <span className="text-stone-hi">Ask it a question.</span>
            </h2>
            <LandingCta />
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[84rem] flex-wrap items-center gap-x-6 gap-y-3 px-5 py-8 text-2xs text-fg-3 sm:px-8">
          <Wordmark size={18} textClass="text-sm" />
          <span>Git hosting with Spark analytics.</span>
          <span className="sm:ml-auto">Repositories are used through the web and API; <code className="font-mono">git push</code> over HTTP isn&apos;t supported yet.</span>
        </div>
      </footer>
    </div>
  );
}

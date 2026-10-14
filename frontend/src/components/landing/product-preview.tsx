import { BookMarked, FileCode2, FileText, Folder, GitBranch, Lock } from "lucide-react";

// A rendered slice of the real interface, built from the app's own classes.
// Every value here is sample data and is labelled as such on the page.
const FILES = [
  { name: "src", dir: true, size: "" },
  { name: "tests", dir: true, size: "" },
  { name: "README.md", icon: FileText, size: "2.1 KB" },
  { name: "ledger.py", icon: FileCode2, size: "8.4 KB" },
];
const COMMITS = [
  { sha: "9f3c2e1", msg: "Reconcile settlement batches nightly", who: "Ana Ruiz", when: "2h ago" },
  { sha: "41ab7d0", msg: "Fix rounding in fee calculation", who: "Kofi Mensah", when: "5h ago" },
];
const BARS = [3, 5, 2, 7, 4, 9, 6, 8, 5, 11, 7, 6, 10, 8];

export function ProductPreview() {
  return (
    <figure className="relative" aria-labelledby="preview-cap">
      <div className="overflow-hidden rounded-md border border-line bg-canvas shadow-[0_40px_80px_-30px_rgb(0_0_0/0.85),0_2px_0_rgb(255_255_255/0.03)_inset]">
        {/* top bar */}
        <div className="flex items-center gap-2 border-b border-line bg-shell px-3.5 py-2.5">
          <BookMarked className="size-3.5 text-fg-3" aria-hidden />
          <span className="hidden text-xs font-semibold whitespace-nowrap text-fg-2 sm:inline">Ana Ruiz</span>
          <span className="hidden text-xs text-fg-3 sm:inline">/</span>
          <span className="truncate text-xs font-bold whitespace-nowrap">ledger-service</span>
          <span className="chip ml-1"><Lock aria-hidden /> Private</span>
          <span className="chip ml-auto font-mono font-medium"><GitBranch aria-hidden /> main</span>
        </div>

        <div className="grid sm:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
          {/* files + history */}
          <div className="border-b border-line sm:border-r sm:border-b-0">
            <ul className="divide-y divide-line-soft text-[0.8125rem]">
              {FILES.map((f) => {
                const Icon = f.dir ? Folder : f.icon!;
                return (
                  <li key={f.name} className="flex items-center gap-2.5 px-3.5 py-1.5">
                    <Icon className={`size-3.5 ${f.dir ? "text-stone" : "text-fg-3"}`} aria-hidden />
                    <span>{f.name}</span>
                    <span className="ml-auto font-mono text-[0.6875rem] text-fg-3">{f.size}</span>
                  </li>
                );
              })}
            </ul>
            <ol className="spine border-t border-line px-3.5 pt-1 pb-1">
              {COMMITS.map((c) => (
                <li key={c.sha} className="py-2">
                  <span className="spine-node" data-tone="solid" />
                  <p className="truncate text-xs font-semibold">{c.msg}</p>
                  <p className="text-[0.6875rem] text-fg-3">
                    <span className="font-mono text-stone-hi">{c.sha}</span> · {c.who} · {c.when}
                  </p>
                </li>
              ))}
              <li className="py-2">
                <span className="spine-node" data-tone="warn" data-live="true" />
                <p className="text-xs font-semibold">Spark job · Commit activity</p>
                <p className="font-mono text-[0.6875rem] text-fg-3">map → reduceByKey · running</p>
                <div className="mt-1.5 h-1 w-40 overflow-hidden rounded-full bg-surface">
                  <div className="h-full w-[64%] rounded-full bg-warn" />
                </div>
              </li>
            </ol>
          </div>

          {/* result */}
          <div className="flex flex-col px-4 py-3.5">
            <p className="text-xs font-bold">Commits per day</p>
            <p className="text-[0.6875rem] text-fg-3">
              from <span className="text-fg-2 underline decoration-stone-2 underline-offset-2">95 commits on main</span>, newest{" "}
              <span className="font-mono text-stone-hi">9f3c2e1</span>
            </p>
            <div className="mt-4 flex h-28 items-end gap-[3px]" aria-hidden>
              {BARS.map((b, i) => (
                <div key={i} className="flex-1 rounded-t-[3px] bg-stone" style={{ height: `${(b / 11) * 100}%`, opacity: i === BARS.length - 5 ? 1 : 0.78 }} />
              ))}
            </div>
            <div className="mt-1 flex justify-between font-mono text-[0.6875rem] text-fg-3" aria-hidden>
              <span>Oct 1</span>
              <span>Oct 14</span>
            </div>
            <dl className="mt-auto grid grid-cols-2 gap-2 border-t border-line-soft pt-3">
              <div>
                <dt className="text-[0.6875rem] text-fg-3">Commits</dt>
                <dd className="font-mono text-sm font-semibold">95</dd>
              </div>
              <div>
                <dt className="text-[0.6875rem] text-fg-3">Spark time</dt>
                <dd className="font-mono text-sm font-semibold">41.2s</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
      <figcaption id="preview-cap" className="mt-3 flex items-center gap-2 text-2xs text-fg-3">
        <span className="chip">Sample data</span>
        The repository browser and an analytics job as they appear in Gitarchy. Names and numbers are illustrative.
      </figcaption>
    </figure>
  );
}

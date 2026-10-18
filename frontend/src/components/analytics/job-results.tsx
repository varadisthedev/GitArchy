"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import type {
  ActivityResult, FileStatsResult, JobResults, KMeansResult, LanguagesResult, TermsResult,
} from "@/lib/api/types";
import { ChartFrame, Churn, Columns, Ranked, VIZ } from "./charts";
import { LanguageBar } from "./language-bar";

type Names = (id: string) => string | undefined;

function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="flex flex-wrap gap-x-8 gap-y-3">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-2xs text-fg-3">{k}</dt>
          <dd className="font-mono text-base font-semibold tabular">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const n = (v: unknown) => Number(v).toLocaleString();
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

function Activity({ r }: { r: ActivityResult }) {
  const groups = useMemo(() => {
    if (r.group_by === "day") return r.groups.toSorted((a, b) => a.key.localeCompare(b.key));
    if (r.group_by === "hour") {
      const by = new Map(r.groups.map((g) => [g.key.padStart(2, "0"), g]));
      return Array.from({ length: 24 }, (_, h) => {
        const k = String(h).padStart(2, "0");
        return by.get(k) ?? { key: k, commits: 0, additions: 0, deletions: 0 };
      });
    }
    return r.groups.slice(0, 25);
  }, [r]);
  const cols = [
    { key: "key" as const, label: r.group_by === "author" ? "Author" : r.group_by === "day" ? "Day" : "Hour (UTC)" },
    { key: "commits" as const, label: "Commits", numeric: true, format: n },
    { key: "additions" as const, label: "Additions", numeric: true, format: n },
    { key: "deletions" as const, label: "Deletions", numeric: true, format: n },
  ];
  const label = r.group_by === "hour" ? groups.map((g) => ({ ...g, key: `${g.key}:00` })) : groups;
  return (
    <div className="space-y-10">
      <Facts items={[["Commits analysed", n(r.total_commits)], [r.group_by === "author" ? "Authors" : r.group_by === "day" ? "Active days" : "Active hours", n(r.groups.length)]]} />
      {r.group_by === "author" ? (
        <ChartFrame title="Commits by author" rows={groups} cols={cols} caption={r.groups.length > 25 ? `Top 25 of ${r.groups.length} authors.` : undefined}>
          <Ranked data={groups} label="key" value="commits" name="Commits" />
        </ChartFrame>
      ) : (
        <ChartFrame title={r.group_by === "day" ? "Commits per day" : "Commits by hour of day (UTC)"} rows={label} cols={cols}>
          <Columns data={label} x="key" y="commits" name="Commits" />
        </ChartFrame>
      )}
      <ChartFrame
        title="Lines changed"
        legend={[{ label: "Additions", color: VIZ.cool }, { label: "Deletions", color: VIZ.warm }]}
        rows={label}
        cols={cols}
        caption="Additions above the line, deletions below."
      >
        <Churn data={label} x="key" />
      </ChartFrame>
    </div>
  );
}

function Terms({ r }: { r: TermsResult }) {
  return (
    <div className="space-y-8">
      <Facts items={[["Messages analysed", n(r.messages)], ["Distinct terms shown", n(r.top_terms.length)]]} />
      {r.top_terms.length ? (
        <ChartFrame title="Most frequent terms in commit messages" rows={r.top_terms} cols={[{ key: "term", label: "Term" }, { key: "count", label: "Count", numeric: true, format: n }]}>
          <Ranked data={r.top_terms} label="term" value="count" name="Occurrences" />
        </ChartFrame>
      ) : (
        <p className="text-sm text-fg-2">No terms survived filtering. Messages may be too short or too uniform.</p>
      )}
    </div>
  );
}

function FileStats({ r, name }: { r: FileStatsResult; name: Names }) {
  const repos = r.by_repo.map((x) => ({ ...x, name: name(x.repo_id) ?? x.repo_id.slice(0, 8) }));
  return (
    <div className="space-y-10">
      <ChartFrame
        title="Files touched by extension"
        rows={r.by_extension}
        cols={[{ key: "ext", label: "Extension" }, { key: "files", label: "Files", numeric: true, format: n }, { key: "commits", label: "Commits", numeric: true, format: n }]}
      >
        <Ranked data={r.by_extension.map((e) => ({ ...e, ext: e.ext || "(none)" }))} label="ext" value="files" name="Files" />
      </ChartFrame>
      <section>
        <h3 className="mb-3 text-sm font-bold">Per repository</h3>
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="data-table min-w-[34rem] text-xs">
            <thead>
              <tr>
                <th scope="col">Repository</th>
                <th scope="col" className="!text-right">Commits</th>
                <th scope="col" className="!text-right">Additions</th>
                <th scope="col" className="!text-right">Deletions</th>
                <th scope="col" className="!text-right">Files / commit</th>
              </tr>
            </thead>
            <tbody>
              {repos.map((x) => (
                <tr key={x.repo_id}>
                  <td><Link href={`/repositories/${x.repo_id}`} className="font-semibold hover:underline">{x.name}</Link></td>
                  <td className="text-right font-mono">{n(x.commits)}</td>
                  <td className="text-right font-mono" style={{ color: VIZ.cool }}>+{n(x.additions)}</td>
                  <td className="text-right font-mono" style={{ color: VIZ.warm }}>−{n(x.deletions)}</td>
                  <td className="text-right font-mono">{x.avg_files_per_commit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

const FEATURE_LABEL: Record<string, string> = { commits: "Commits", additions: "Additions", deletions: "Deletions", files_changed: "Files changed", authors: "Authors" };

function KMeans({ r, name }: { r: KMeansResult; name: Names }) {
  const feats = Object.keys(r.clusters[0]?.mean ?? {});
  return (
    <div className="space-y-8">
      <Facts
        items={[
          ["Clusters (k)", r.k],
          ["Silhouette", r.silhouette == null ? "n/a" : r.silhouette.toFixed(3)],
          ["Training cost", r.training_cost.toFixed(2)],
        ]}
      />
      {r.silhouette == null ? <p className="text-xs text-fg-3">Silhouette needs at least two non-empty clusters.</p> : null}
      <section>
        <h3 className="mb-1 text-sm font-bold">Clusters</h3>
        <p className="mb-3 text-xs text-fg-2">Average activity per repository in each cluster. Repositories in the same cluster have similar profiles.</p>
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="data-table min-w-[40rem] text-xs">
            <thead>
              <tr>
                <th scope="col">Cluster</th>
                <th scope="col">Repositories</th>
                {feats.map((f) => <th key={f} scope="col" className="!text-right">{FEATURE_LABEL[f] ?? f}</th>)}
              </tr>
            </thead>
            <tbody>
              {r.clusters.map((c) => (
                <tr key={c.cluster} className="align-top">
                  <td className="font-mono font-semibold whitespace-nowrap">#{c.cluster + 1} <span className="font-sans font-normal text-fg-3">({c.size})</span></td>
                  <td>
                    <ul className="flex flex-wrap gap-x-2 gap-y-1">
                      {c.repo_ids.map((id) => (
                        <li key={id}><Link href={`/repositories/${id}`} className="link">{name(id) ?? id.slice(0, 8)}</Link></li>
                      ))}
                    </ul>
                  </td>
                  {feats.map((f) => <td key={f} className="text-right font-mono">{n(c.mean[f])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Languages({ r }: { r: LanguagesResult }) {
  const top = r.languages[0];
  const name = r.top_files[0];
  return (
    <div className="space-y-8">
      <Facts
        items={[
          ["Most used", top ? <>{top.language} <span className="text-sm font-normal text-fg-2">{pct(top.share)}</span></> : "—"],
          ["Languages", n(r.languages.length)],
          ["Files", n(r.total_files)],
          ["Commonest filename", name ? <>{name.name} <span className="text-sm font-normal text-fg-2">×{name.count}</span></> : "—"],
        ]}
      />
      <section>
        <h3 className="mb-3 text-sm font-bold">Languages</h3>
        <LanguageBar languages={r.languages} totalBytes={r.total_bytes} />
        <p className="mt-3 max-w-[70ch] text-xs text-fg-2">
          Share of {n(r.total_files)} files across {r.repos === 1 ? "this repository" : `${n(r.repos)} repositories`},
          measured in bytes of the current tree rather than files changed — so it reflects what the code is, not what
          was edited recently. Images, fonts and other carried assets are named as what they are; only unrecognised
          extensions and dotfiles count as Other.
        </p>
      </section>
      <ChartFrame
        title="Most frequent filenames"
        caption="Counted by basename, so the same name in different directories adds up."
        rows={r.top_files}
        cols={[
          { key: "name", label: "Filename" },
          { key: "count", label: "Files", numeric: true, format: n },
          { key: "share", label: "Share", numeric: true, format: (v) => pct(Number(v)) },
        ]}
      >
        <Ranked data={r.top_files} label="name" value="count" name="Files" />
      </ChartFrame>
    </div>
  );
}

export default function JobResultView({ results, repoName }: { results: JobResults; repoName: Names }) {
  const r = results.result as never;
  if (!r) return <p className="text-sm text-fg-2">The job finished without a result payload.</p>;
  switch (results.task_type) {
    case "commit_activity_rdd": return <Activity r={r} />;
    case "message_terms_mapreduce": return <Terms r={r} />;
    case "file_stats_sql": return <FileStats r={r} name={repoName} />;
    case "repo_clustering_kmeans": return <KMeans r={r} name={repoName} />;
    case "language_breakdown": return <Languages r={r} />;
    default:
      return <pre className="code-well overflow-auto rounded-md p-4 text-xs">{JSON.stringify(results.result, null, 2)}</pre>;
  }
}

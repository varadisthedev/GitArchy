"use client";

import { ChevronDown, ChevronRight, FileDiff, Minus, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import type { Diff } from "@/lib/api/types";
import { plural } from "@/lib/format";

type Line = { kind: "add" | "del" | "ctx" | "hunk" | "meta"; text: string; oldNo?: number; newNo?: number };
type FileDiffParsed = { path: string; oldPath?: string; status: "added" | "deleted" | "renamed" | "modified"; binary: boolean; lines: Line[] };

const LINE_CAP = 1500; // per file, before "show all"

/** Parse unified `git diff` output into files and numbered lines. */
export function parsePatch(patch: string): FileDiffParsed[] {
  const files: FileDiffParsed[] = [];
  let cur: FileDiffParsed | null = null;
  let o = 0;
  let n = 0;
  let inHunk = false; // header lines (---, +++, index, mode…) only appear before a file's first hunk
  for (const raw of patch.split("\n")) {
    if (raw.startsWith("diff --git ")) {
      inHunk = false;
      const m = /^diff --git a\/(.*) b\/(.*)$/.exec(raw);
      cur = { path: m?.[2] ?? raw.slice(11), status: "modified", binary: false, lines: [] };
      files.push(cur);
      continue;
    }
    if (!cur) continue;
    if (raw.startsWith("@@")) {
      const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(raw);
      o = Number(m?.[1] ?? 0);
      n = Number(m?.[2] ?? 0);
      inHunk = true;
      cur.lines.push({ kind: "hunk", text: raw });
    } else if (!inHunk) {
      if (raw.startsWith("new file mode")) cur.status = "added";
      else if (raw.startsWith("deleted file mode")) cur.status = "deleted";
      else if (raw.startsWith("rename from ")) { cur.status = "renamed"; cur.oldPath = raw.slice(12); }
      else if (raw.startsWith("Binary files")) cur.binary = true;
    } else if (raw.startsWith("+")) cur.lines.push({ kind: "add", text: raw.slice(1), newNo: n++ });
    else if (raw.startsWith("-")) cur.lines.push({ kind: "del", text: raw.slice(1), oldNo: o++ });
    else if (raw.startsWith(" ")) cur.lines.push({ kind: "ctx", text: raw.slice(1), oldNo: o++, newNo: n++ });
    else if (raw.startsWith("\\")) cur.lines.push({ kind: "meta", text: raw });
  }
  return files;
}

const STATUS_LABEL = { added: "Added", deleted: "Deleted", renamed: "Renamed", modified: "Modified" };

function Stat({ add, del }: { add: number | null; del: number | null }) {
  const total = (add ?? 0) + (del ?? 0);
  const blocks = 5;
  const a = total ? Math.round(((add ?? 0) / total) * blocks) : 0;
  return (
    <span className="inline-flex items-center gap-2 font-mono text-2xs tabular">
      <span className="text-ok">+{add ?? 0}</span>
      <span className="text-err">−{del ?? 0}</span>
      <span aria-hidden className="flex gap-px">
        {Array.from({ length: blocks }, (_, i) => (
          <span key={i} className={`size-[7px] rounded-[1px] ${!total ? "bg-surface" : i < a ? "bg-ok" : "bg-err"}`} />
        ))}
      </span>
    </span>
  );
}

function FileBlock({ f, stats }: { f: FileDiffParsed; stats?: { additions: number | null; deletions: number | null } }) {
  const [open, setOpen] = useState(f.lines.length < 600);
  const [all, setAll] = useState(false);
  const shown = all ? f.lines : f.lines.slice(0, LINE_CAP);
  const id = `diff-${f.path.replace(/[^\w-]/g, "-")}`;
  return (
    <section id={id} aria-label={f.path} className="overflow-clip rounded-md border border-line">
      <h3 className="sticky top-[var(--topbar-h)] z-10 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-shell px-3 py-2">
        <button className="btn btn-ghost btn-sm btn-icon" aria-expanded={open} aria-controls={`${id}-body`} aria-label={open ? `Collapse ${f.path}` : `Expand ${f.path}`} onClick={() => setOpen((x) => !x)}>
          {open ? <ChevronDown /> : <ChevronRight />}
        </button>
        <span className="min-w-0 flex-1 font-mono text-[0.78rem] font-semibold break-all">
          {f.oldPath ? <><span className="text-fg-3">{f.oldPath} → </span>{f.path}</> : f.path}
        </span>
        <span className="chip">{STATUS_LABEL[f.status]}</span>
        {stats ? <Stat add={stats.additions} del={stats.deletions} /> : null}
      </h3>
      {open ? (
        <div id={`${id}-body`}>
          {f.binary ? (
            <p className="bg-deep px-4 py-4 text-xs text-fg-2">Binary file changed.</p>
          ) : !f.lines.length ? (
            <p className="bg-deep px-4 py-4 text-xs text-fg-2">{f.status === "renamed" ? "Renamed without content changes." : "No content changes (mode change or empty file)."}</p>
          ) : (
            <div className="code-well overflow-x-auto">
              <table className="min-w-full border-collapse" role="presentation">
                <tbody>
                  {shown.map((l, i) =>
                    l.kind === "hunk" ? (
                      <tr key={i} className="bg-[#151517]">
                        <td colSpan={4} className="px-3 py-1 text-info/80 whitespace-pre">{l.text}</td>
                      </tr>
                    ) : (
                      <tr key={i} className={l.kind === "add" ? "bg-[var(--add-bg)]" : l.kind === "del" ? "bg-[var(--del-bg)]" : ""}>
                        <td className="w-[1%] min-w-12 px-2 text-right text-[#6a6564] select-none">{l.oldNo ?? ""}</td>
                        <td className="w-[1%] min-w-12 px-2 text-right text-[#6a6564] select-none">{l.newNo ?? ""}</td>
                        <td
                          className={`w-6 text-center select-none ${l.kind === "add" ? "bg-[var(--add-bg-strong)] text-ok" : l.kind === "del" ? "bg-[var(--del-bg-strong)] text-err" : "text-fg-4"}`}
                        >
                          {/* the sign column: change type is never colour-only */}
                          {l.kind === "add" ? <Plus className="mx-auto size-3" aria-label="added" /> : l.kind === "del" ? <Minus className="mx-auto size-3" aria-label="removed" /> : null}
                        </td>
                        <td className={`pr-6 pl-2 whitespace-pre ${l.kind === "meta" ? "text-fg-3 italic" : "text-fg"}`}>{l.text || " "}</td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
              {shown.length < f.lines.length ? (
                <div className="flex items-center justify-between border-t border-line-soft px-4 py-2 font-sans text-xs text-fg-2">
                  <span>{plural(f.lines.length - shown.length, "more line")}</span>
                  <button className="btn btn-sm" onClick={() => setAll(true)}>Show all</button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

export function DiffView({ diff }: { diff: Diff }) {
  const files = useMemo(() => parsePatch(diff.patch), [diff.patch]);
  const stat = useMemo(() => new Map(diff.files.map((f) => [f.path, f])), [diff.files]);
  const adds = diff.files.reduce((s, f) => s + (f.additions ?? 0), 0);
  const dels = diff.files.reduce((s, f) => s + (f.deletions ?? 0), 0);

  if (!diff.files.length)
    return <p className="rounded-md border border-line px-4 py-6 text-sm text-fg-2">These revisions are identical. There&apos;s nothing to compare.</p>;

  return (
    <div className="space-y-4">
      <details className="group rounded-md border border-line" open={diff.files.length <= 12}>
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5 text-xs">
          <FileDiff className="size-4 text-fg-3" aria-hidden />
          <span className="font-semibold">{plural(diff.files.length, "file")} changed</span>
          <span className="font-mono text-2xs"><span className="text-ok">+{adds}</span> <span className="text-err">−{dels}</span></span>
          <ChevronDown className="ml-auto size-4 text-fg-3 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <ul className="divide-y divide-line-soft border-t border-line">
          {diff.files.map((f) => (
            <li key={f.path} className="flex items-center gap-3 px-3 py-1.5">
              <a href={`#diff-${f.path.replace(/[^\w-]/g, "-")}`} className="min-w-0 flex-1 truncate font-mono text-[0.78rem] text-fg-2 hover:text-fg hover:underline">
                {f.path}
              </a>
              {f.binary ? <span className="chip">binary</span> : <Stat add={f.additions} del={f.deletions} />}
            </li>
          ))}
        </ul>
      </details>
      {diff.truncated ? (
        <p role="status" className="rounded-md border border-warn/40 px-3 py-2 text-xs text-warn">
          This diff is larger than the server&apos;s limit, so it was cut off. File totals above are complete; some patches below are partial.
        </p>
      ) : null}
      {files.map((f) => (
        <FileBlock key={f.path} f={f} stats={stat.get(f.path)} />
      ))}
    </div>
  );
}

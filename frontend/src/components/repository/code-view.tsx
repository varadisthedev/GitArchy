"use client";

import { useEffect, useMemo, useState } from "react";
import type { ThemedToken } from "shiki/core";
import { langFor, tokenize } from "@/lib/highlight";

const RENDER_CAP = 4000; // lines rendered before "show all"
const HIGHLIGHT_CAP = 200_000; // chars; beyond this we render plain text

export function CodeView({ code, path }: { code: string; path: string }) {
  const lines = useMemo(() => {
    const ls = code.split("\n");
    if (ls.length > 1 && ls[ls.length - 1] === "") ls.pop(); // trailing newline isn't a line
    return ls;
  }, [code]);
  const lang = langFor(path);
  const canHighlight = !!lang && code.length <= HIGHLIGHT_CAP;
  const [result, setResult] = useState<{ code: string; tokens: ThemedToken[][] } | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!canHighlight || !lang) return;
    let live = true;
    tokenize(code, lang).then((t) => {
      if (live && t) setResult({ code, tokens: t });
    });
    return () => {
      live = false;
    };
  }, [code, lang, canHighlight]);

  // tokens from a previous file must never paint over this one
  const tokens = result?.code === code ? result.tokens : null;

  // jump to #L42 after first paint
  useEffect(() => {
    const h = window.location.hash;
    if (/^#L\d+$/.test(h)) document.getElementById(h.slice(1))?.scrollIntoView({ block: "center" });
  }, []);

  const shown = showAll ? lines.length : Math.min(lines.length, RENDER_CAP);
  const gutter = `${Math.max(3, String(lines.length).length + 2)}ch`;

  return (
    <div>
      <div className="code-well overflow-x-auto py-2" style={{ ["--gutter" as string]: `calc(${gutter} + 1.35rem)` }}>
        <div className="min-w-max">
          {lines.slice(0, shown).map((line, i) => (
            <div key={i} id={`L${i + 1}`} className="code-line">
              <a href={`#L${i + 1}`} className="code-ln" aria-label={`Line ${i + 1}`}>
                {i + 1}
              </a>
              <span className="code-text">
                {tokens?.[i]
                  ? tokens[i].map((t, j) => (
                      <span key={j} style={{ color: t.color, fontStyle: (t.fontStyle ?? 0) & 1 ? "italic" : undefined, fontWeight: (t.fontStyle ?? 0) & 2 ? 650 : undefined }}>
                        {t.content}
                      </span>
                    ))
                  : line || " "}
              </span>
            </div>
          ))}
        </div>
      </div>
      {shown < lines.length ? (
        <div className="flex items-center justify-between gap-3 border-t border-line-soft bg-deep px-4 py-2.5 text-xs text-fg-2">
          <span>Showing {shown.toLocaleString()} of {lines.length.toLocaleString()} lines.</span>
          <button className="btn btn-sm" onClick={() => setShowAll(true)}>Show all lines</button>
        </div>
      ) : null}
      {lang && !canHighlight ? <p className="border-t border-line-soft bg-deep px-4 py-2 text-2xs text-fg-3">Large file: syntax highlighting is off.</p> : null}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { useFile } from "@/lib/api/queries";
import { tokenize } from "@/lib/highlight";
import type { ThemedToken } from "shiki/core";

// Repository content is untrusted. Raw HTML is never parsed (no rehype-raw) and the tree is sanitized
// against GitHub's allow-list as a second line of defence.

const IMG_MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };
const isExternal = (u: string) => /^(https?:|mailto:)/i.test(u);

function resolve(dir: string, rel: string) {
  const out = dir ? dir.split("/") : [];
  for (const part of rel.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

function RepoImage({ repoId, gitRef, path, alt }: { repoId: string; gitRef: string; path: string; alt: string }) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const mime = IMG_MIME[ext];
  const f = useFile(repoId, gitRef, path, !!mime);
  if (!mime) return <span className="text-fg-3">[{alt || path}]</span>; // SVG is not inlined: it can carry script
  if (!f.data || f.data.encoding !== "base64") return <span className="text-fg-3">[{alt || path}]</span>;
  // eslint-disable-next-line @next/next/no-img-element -- data URL from the repository, not an optimizable asset
  return <img src={`data:${mime};base64,${f.data.content}`} alt={alt} />;
}

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [tokens, setTokens] = useState<ThemedToken[][] | null>(null);
  useEffect(() => {
    if (!lang) return;
    let live = true;
    tokenize(code, lang).then((t) => live && setTokens(t));
    return () => {
      live = false;
    };
  }, [code, lang]);
  if (!tokens) return <code>{code}</code>;
  return (
    <code>
      {tokens.map((line, i) => (
        <span key={i}>
          {line.map((t, j) => (
            <span key={j} style={{ color: t.color }}>{t.content}</span>
          ))}
          {i < tokens.length - 1 ? "\n" : null}
        </span>
      ))}
    </code>
  );
}

export function Markdown({ source, repoId, gitRef, dir }: { source: string; repoId: string; gitRef: string; dir: string }) {
  return (
    <div className="prose-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          a({ href = "", children }) {
            if (isExternal(href)) return <a href={href} target="_blank" rel="noopener noreferrer nofollow">{children}</a>;
            if (href.startsWith("#")) return <a href={href}>{children}</a>;
            const path = resolve(dir, href.split("#")[0]);
            return <Link href={`/repositories/${repoId}/blob?ref=${encodeURIComponent(gitRef)}&path=${encodeURIComponent(path)}`}>{children}</Link>;
          },
          img({ src, alt = "" }) {
            const s = typeof src === "string" ? src : "";
            // eslint-disable-next-line @next/next/no-img-element -- third-party README image
            if (/^https:/i.test(s)) return <img src={s} alt={alt} loading="lazy" referrerPolicy="no-referrer" />;
            if (!s || isExternal(s)) return <span className="text-fg-3">[{alt}]</span>; // no http: mixed content
            return <RepoImage repoId={repoId} gitRef={gitRef} path={resolve(dir, s)} alt={alt} />;
          },
          code({ className, children }) {
            const lang = /language-([\w-]+)/.exec(className ?? "")?.[1];
            const text = String(children ?? "");
            if (!lang && !text.includes("\n")) return <code>{children}</code>;
            return <CodeBlock code={text.replace(/\n$/, "")} lang={lang} />;
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}

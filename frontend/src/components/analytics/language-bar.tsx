"use client";

import type { LanguagesResult } from "@/lib/api/types";

/**
 * Share of the repository by language, as one stacked bar.
 *
 * Measured in bytes of the file tree, not files changed, so it answers "what is this repository made
 * of" rather than "what has been edited lately". Colours are each language's own, which is the one
 * place this UI deliberately steps outside its palette: a reader recognises Go's cyan faster than any
 * ordering we could invent. Anything under MIN_SHARE is folded into Other so the bar stays readable.
 */
const MIN_SHARE = 0.005;

// Linguist's colours, for the languages this server can name. Unknown ones fall back to a stable hue.
const COLORS: Record<string, string> = {
  TypeScript: "#3178c6", JavaScript: "#f1e05a", Python: "#3572a5", Java: "#b07219",
  Go: "#00add8", Rust: "#dea584", C: "#555555", "C++": "#f34b7d", "C#": "#178600",
  Ruby: "#701516", PHP: "#4f5d95", Swift: "#f05138", Kotlin: "#a97bff", Scala: "#c22d40",
  Dart: "#00b4ab", Elixir: "#6e4a7e", Haskell: "#5e5086", Clojure: "#db5855", Erlang: "#b83998",
  Lua: "#000080", Perl: "#0298c3", R: "#198ce7", "Objective-C": "#438eff", Shell: "#89e051",
  PowerShell: "#012456", Vue: "#41b883", Svelte: "#ff3e00", HTML: "#e34c26", CSS: "#563d7c",
  SCSS: "#c6538c", Less: "#1d365d", Markdown: "#083fa1", reStructuredText: "#141414",
  JSON: "#a4a4a4", YAML: "#cb171e", TOML: "#9c4221", XML: "#0060ac", INI: "#d1dbe0",
  SQL: "#e38c00", "Jupyter Notebook": "#da5b0b", Dockerfile: "#384d54", Makefile: "#427819",
  CMake: "#da3434", Gradle: "#02303a", Terraform: "#844fba", "Protocol Buffers": "#c1cdd4",
  "Vim Script": "#199f4b", Other: "var(--fg-4)",
  // Assets are not code. Muted greys on purpose, so bytes of PNG never read as a language.
  Images: "#7d7572", Fonts: "#6e6866", Video: "#8a807c", Audio: "#79716e", Archives: "#655f5d",
  Documents: "#6b6462", Data: "#847a76", Binaries: "#5c5755", Text: "#736c6a",
  "Source maps": "#605a58", Lockfiles: "#574f4d", Config: "#6a625f",
  // not a measurement: the survey withholding a figure too small to report anonymously
  undisclosed: "var(--fg-4)",
};

/** Stable per-name hue, so an unnamed language keeps the same colour between runs and views. */
export function colorFor(language: string): string {
  if (COLORS[language]) return COLORS[language];
  let h = 0;
  for (const ch of language) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `oklch(0.68 0.13 ${h})`;
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const bytes = (v: number) =>
  v < 1024 ? `${v} B` : v < 1024 ** 2 ? `${(v / 1024).toFixed(1)} KB` : `${(v / 1024 ** 2).toFixed(1)} MB`;

type Lang = LanguagesResult["languages"][number];

/** Buckets that are not languages. Mirrors the asset categories in colab_worker/tasks.py. */
export const ASSET_KINDS = new Set(["Images", "Fonts", "Video", "Audio", "Archives", "Documents",
  "Data", "Models", "Binaries", "Text", "Source maps", "Lockfiles", "Config", "Other"]);

export type Metric = "bytes" | "files";

/**
 * Re-express the breakdown as shares of file COUNT instead of bytes.
 *
 * Bytes answer "what is this made of"; counts answer "what do people actually write here". A 2 MB
 * model and a one-line stylesheet are one file each, so counting rescues every language that real
 * work happens in but which weighs nothing. Both readings are true, which is why the page offers
 * both rather than picking for the reader.
 */
export function byMetric(languages: Lang[], metric: Metric): Lang[] {
  if (metric === "bytes") return languages;
  const total = languages.reduce((n, l) => n + l.files, 0) || 1;
  return languages.map((l) => ({ ...l, share: l.files / total })).sort((a, b) => b.share - a.share);
}

/**
 * The headline "most used" bucket, which has to name a language: a repository carrying 11 MB of
 * screenshots is not "written in" Images.
 *
 * The share is left exactly as the server computed it - a share of the whole tree - so the number
 * agrees with the segment the reader can see in the bar. Renormalising over code only would print
 * 100% beside a bar segment covering half its width. A tree with no code at all falls back to its
 * largest bucket, because "-" would be less honest than naming what is actually there.
 */
export function topLanguage(languages: Lang[]): Lang | null {
  return languages.find((l) => !ASSET_KINDS.has(l.language)) ?? languages[0] ?? null;
}

/**
 * Everything under MIN_SHARE folds into one "Other", which always sorts last.
 *
 * The server emits its own "Other" bucket for extensions it cannot name, so the tail must merge INTO
 * that bucket rather than be appended beside it - two entries called "Other" is both a wrong legend
 * and a duplicate React key.
 */
export function foldLanguages(languages: Lang[]): Lang[] {
  const shown: Lang[] = [];
  const other: Lang = { language: "Other", bytes: 0, files: 0, share: 0 };
  let folded = false;
  for (const l of languages) {
    if (l.language !== "Other" && l.share >= MIN_SHARE) {
      shown.push(l);
      continue;
    }
    other.bytes += l.bytes;
    other.files += l.files;
    other.share += l.share;
    folded = true;
  }
  return folded ? [...shown, other] : shown;
}

export function LanguageBar({ languages }: { languages: Lang[] }) {
  const shown = foldLanguages(languages);

  return (
    <div>
      <div
        className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full bg-surface"
        role="img"
        aria-label={shown.map((l) => `${l.language} ${pct(l.share)}`).join(", ")}
      >
        {shown.map((l) => (
          <span
            key={l.language}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ width: `${l.share * 100}%`, backgroundColor: colorFor(l.language) }}
            title={`${l.language} · ${pct(l.share)} · ${bytes(l.bytes)}`}
          />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {shown.map((l) => (
          <li key={l.language} className="flex items-baseline gap-1.5 text-xs">
            <span className="size-2 flex-none translate-y-[1px] rounded-full" style={{ backgroundColor: colorFor(l.language) }} aria-hidden />
            <span className="font-semibold text-fg">{l.language}</span>
            <span className="font-mono text-fg-2 tabular">{pct(l.share)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

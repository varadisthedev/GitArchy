// Lazy syntax highlighting. Nothing here loads until a code view mounts; each grammar loads on first use.
import type { HighlighterCore, ThemedToken } from "shiki/core";

const EXT: Record<string, string> = {
  ts: "typescript", mts: "typescript", cts: "typescript", tsx: "tsx", js: "javascript", mjs: "javascript", cjs: "javascript",
  jsx: "jsx", json: "json", jsonc: "jsonc", py: "python", pyi: "python", md: "markdown", mdx: "mdx", css: "css",
  scss: "scss", sass: "sass", less: "less", html: "html", htm: "html", vue: "vue", svelte: "svelte", astro: "astro",
  yml: "yaml", yaml: "yaml", toml: "toml", ini: "ini", cfg: "ini", sh: "shellscript", bash: "shellscript",
  zsh: "shellscript", ps1: "powershell", go: "go", rs: "rust", java: "java", kt: "kotlin", kts: "kotlin",
  scala: "scala", swift: "swift", c: "c", h: "c", cpp: "cpp", cc: "cpp", hpp: "cpp", cs: "csharp", rb: "ruby",
  php: "php", sql: "sql", xml: "xml", svg: "xml", graphql: "graphql", gql: "graphql", lua: "lua", r: "r",
  dart: "dart", ex: "elixir", exs: "elixir", erl: "erlang", hs: "haskell", clj: "clojure", tf: "hcl",
  hcl: "hcl", proto: "proto", diff: "diff", patch: "diff", prisma: "prisma", zig: "zig", nix: "nix",
};
const NAMES: Record<string, string> = {
  dockerfile: "docker", makefile: "make", "cmakelists.txt": "cmake", ".gitignore": "ignore", ".env": "dotenv",
  gemfile: "ruby", rakefile: "ruby",
};

export function langFor(path: string): string | null {
  const base = path.split("/").pop()!.toLowerCase();
  if (NAMES[base]) return NAMES[base];
  if (base.startsWith("dockerfile")) return "docker";
  const ext = base.includes(".") ? base.split(".").pop()! : "";
  return EXT[ext] ?? null;
}

// Stone-graphite theme built from the Gitarchy palette.
const theme = {
  name: "gitarchy-stone",
  type: "dark" as const,
  colors: { "editor.background": "#0a0a0a", "editor.foreground": "#e6e1de" },
  tokenColors: [
    { scope: ["comment", "punctuation.definition.comment"], settings: { foreground: "#857f7c", fontStyle: "italic" } },
    { scope: ["keyword", "storage", "storage.type", "keyword.operator.new", "keyword.control"], settings: { foreground: "#d6b49b" } },
    { scope: ["string", "string.quoted", "string.template", "markup.inline.raw"], settings: { foreground: "#a9c6a2" } },
    { scope: ["constant.numeric", "constant.language", "constant.character", "support.constant"], settings: { foreground: "#e3b56e" } },
    { scope: ["entity.name.function", "support.function", "meta.function-call entity.name.function"], settings: { foreground: "#ece4dd", fontStyle: "bold" } },
    { scope: ["entity.name.type", "entity.name.class", "support.type", "support.class", "entity.other.inherited-class"], settings: { foreground: "#a9bccd" } },
    { scope: ["variable.parameter"], settings: { foreground: "#d9cfc9", fontStyle: "italic" } },
    { scope: ["variable", "meta.definition.variable"], settings: { foreground: "#e6e1de" } },
    { scope: ["entity.name.tag", "punctuation.definition.tag"], settings: { foreground: "#d6b49b" } },
    { scope: ["entity.other.attribute-name"], settings: { foreground: "#c8b9a7" } },
    { scope: ["punctuation", "meta.brace", "keyword.operator"], settings: { foreground: "#a39b98" } },
    { scope: ["markup.heading", "entity.name.section"], settings: { foreground: "#f3f0ee", fontStyle: "bold" } },
    { scope: ["markup.bold"], settings: { fontStyle: "bold" } },
    { scope: ["markup.italic"], settings: { fontStyle: "italic" } },
    { scope: ["markup.inserted"], settings: { foreground: "#88c098" } },
    { scope: ["markup.deleted"], settings: { foreground: "#ec8a7c" } },
    { scope: ["support.type.property-name", "meta.object-literal.key"], settings: { foreground: "#d9cfc9" } },
    { scope: ["invalid"], settings: { foreground: "#ec8a7c" } },
  ],
};

let hl: Promise<HighlighterCore> | null = null;
function highlighter() {
  hl ??= Promise.all([import("shiki/core"), import("shiki/engine/javascript")]).then(([core, eng]) =>
    core.createHighlighterCore({ themes: [theme], langs: [], engine: eng.createJavaScriptRegexEngine() }),
  );
  return hl;
}

export async function tokenize(code: string, lang: string): Promise<ThemedToken[][] | null> {
  try {
    const [h, { bundledLanguages }] = await Promise.all([highlighter(), import("shiki/langs")]);
    const loader = bundledLanguages[lang as keyof typeof bundledLanguages];
    if (!loader) return null;
    if (!h.getLoadedLanguages().includes(lang)) await h.loadLanguage(loader);
    return h.codeToTokens(code, { lang, theme: "gitarchy-stone" }).tokens;
  } catch {
    return null; // grammar failed: plain text is a fine fallback
  }
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000], ["month", 2_592_000], ["week", 604_800], ["day", 86_400], ["hour", 3_600], ["minute", 60],
];

export function relTime(iso: string, now = Date.now()): string {
  const s = (new Date(iso).getTime() - now) / 1000;
  for (const [unit, secs] of STEPS) if (Math.abs(s) >= secs) return rtf.format(Math.round(s / secs), unit);
  return "just now";
}

const full = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });
const dayFmt = new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
export const fullDate = (iso: string) => full.format(new Date(iso));
export const dayLabel = (iso: string) => dayFmt.format(new Date(iso));
export const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

export function bytes(n: number | null | undefined): string {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(n < 10_240 ? 1 : 0)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}

/** One value out of a Next.js searchParams entry. */
export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
/** A ref that names a commit rather than a branch. Commits are immutable, so writes are off. */
export const isSha = (ref: string) => /^[0-9a-f]{7,40}$/.test(ref);

export const shortSha = (sha: string) => sha.slice(0, 7);

export function seconds(s: number | undefined | null): string {
  if (s == null) return "—";
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

/** repository-relative path helpers (backend paths are POSIX, no leading slash) */
export const joinPath = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);
export const parentPath = (p: string) => p.split("/").slice(0, -1).join("/");
export const baseName = (p: string) => p.split("/").pop() ?? p;

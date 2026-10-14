// Client mirrors of backend/app/utils/validators.py. The server stays authoritative; these give instant feedback.
const BRANCH_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/;
const REPO_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export function validRepoName(n: string): string | undefined {
  if (!n) return "Enter a repository name.";
  if (!REPO_RE.test(n) || n.endsWith(".git") || n.endsWith("."))
    return "Use 1–64 letters, digits, “.”, “_” or “-”, starting with a letter or digit, not ending in “.” or “.git”.";
}

export function validBranch(n: string): string | undefined {
  if (!n) return "Enter a branch name.";
  if (
    !BRANCH_RE.test(n) ||
    n.endsWith("/") || n.endsWith(".") || n.endsWith(".lock") ||
    ["..", "//", "@{", ".lock/", "\\"].some((s) => n.includes(s)) ||
    n.split("/").some((p) => p === "" || p.startsWith("."))
  )
    return "Use letters, digits, “.”, “_”, “-” and “/”. No “..”, no part starting with “.”, no trailing “/” or “.lock”.";
}

export function validPath(p: string): string | undefined {
  if (!p) return "Enter a file path.";
  if (p.length > 400) return "Paths are limited to 400 characters.";
  if (p.startsWith("/") || /^[A-Za-z]:/.test(p)) return "Use a path relative to the repository root.";
  if (p.includes("\\") || /[\x00-\x1f]/.test(p)) return "Paths can't contain backslashes or control characters.";
  const parts = p.replace(/\/+$/, "").split("/");
  if (parts.length > 20) return "Paths can be at most 20 levels deep.";
  if (parts.some((x) => x === "" || x === "." || x === ".." || x.toLowerCase() === ".git"))
    return "Path segments can't be empty, “.”, “..” or “.git”.";
}

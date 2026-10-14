// The one place that talks HTTP to the FastAPI backend.
// Bearer JWT (no cookies: backend CORS has credentials disabled). Token lives in memory + sessionStorage via lib/auth.

export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
export const API_V1 = `${API_BASE}/api/v1`;

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId: string | null = null,
    public details: { loc: (string | number)[]; msg: string }[] = [],
    public retryAfter: number | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
  /** first validation message for a body field, e.g. fieldError("email") */
  fieldError(field: string): string | undefined {
    return this.details.find((d) => d.loc[d.loc.length - 1] === field)?.msg;
  }
}

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(t: string | null) {
  token = t;
}
export function getAuthToken() {
  return token;
}
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

type Opts = {
  method?: string;
  body?: unknown;
  form?: FormData;
  signal?: AbortSignal;
  query?: Record<string, string | number | undefined | null>;
  timeoutMs?: number;
};

export async function api<T>(path: string, opts: Opts = {}): Promise<T> {
  const url = new URL(`${API_V1}${path}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  const headers: Record<string, string> = { Accept: "application/json" };
  const sentToken = token;
  if (sentToken) headers.Authorization = `Bearer ${sentToken}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? 30_000);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;

  let res: Response;
  try {
    res = await fetch(url, { method: opts.method ?? (body ? "POST" : "GET"), headers, body, signal });
  } catch (e) {
    if (opts.signal?.aborted) throw e; // caller cancelled; let react-query drop it
    if (timeout.aborted) throw new ApiError(0, "timeout", "The server took too long to respond. Try again.");
    throw new ApiError(0, "network_error", "Can't reach the Gitarchy API. Check your connection or try again shortly.");
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (res.ok) return data as T;

  const err = data?.error ?? {};
  const apiErr = new ApiError(
    res.status,
    err.code ?? "http_error",
    humanize(res.status, err.code, err.message),
    err.request_id ?? res.headers.get("X-Request-ID"),
    err.details ?? [],
    Number(res.headers.get("Retry-After")) || null,
  );
  // a token we sent was rejected -> the session is over (expired or revoked)
  if (res.status === 401 && sentToken && sentToken === token) onUnauthorized?.();
  throw apiErr;
}

const MESSAGES: Record<string, string> = {
  email_taken: "An account with this email already exists.",
  repo_name_taken: "You already have a repository with this name.",
  branch_exists: "A branch with this name already exists.",
  stale_parent: "This branch moved since you started editing. Reload the file to get the latest version, then reapply your change.",
  path_conflict: "That path conflicts with an existing file or folder.",
  nothing_to_commit: "Nothing changed, so there's nothing to commit.",
  file_too_large: "This file is too large to display in the browser.",
  commit_too_large: "This commit is larger than the server allows.",
  repo_storage_unavailable: "This repository's Git storage is unavailable on the server right now. Its details are safe; files and history can't be read until storage is restored.",
  integration_not_configured: "This feature isn't configured on this server.",
  analytics_disabled: "Analytics is turned off on this server.",
  analytics_quota_exceeded: "You've reached your analytics job limit. Wait for a running job to finish, then try again.",
  results_not_ready: "Results aren't ready yet.",
  not_cancellable: "Only queued jobs can be cancelled.",
  revision_not_found: "That branch or commit doesn't exist.",
  path_not_found: "That path doesn't exist on this branch.",
  user_not_found: "No Gitarchy account uses that email.",
  image_too_large: "The image is larger than 2 MB.",
};

function humanize(status: number, code?: string, message?: string): string {
  if (code && MESSAGES[code]) return MESSAGES[code];
  if (status === 429) return "Too many requests. Wait a moment and try again.";
  if (status === 403) return message || "You don't have permission to do that.";
  if (status === 404) return message || "Not found.";
  if (status >= 500) return "The server hit an error. Try again in a moment.";
  return message || "Something went wrong.";
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

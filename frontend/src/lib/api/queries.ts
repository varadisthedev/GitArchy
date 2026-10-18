"use client";

import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { api, API_BASE, COLD_START_TIMEOUT_MS } from "./client";
import type {
  ActivityEvent, Branch, Commit, Diff, ExportResult, FileBlob, FileChange, GithubCallbackResult, GithubRepo, GithubStatus, ImportResult, Job, JobResults, Member, Notification, Ready, Repo, RepoLanguages, Survey, TaskType, Tree, User, Visibility,
} from "./types";

// Keys are hierarchical so one invalidate(["repo", id]) refreshes everything under a repository.
export const qk = {
  me: ["me"] as const,
  ready: ["ready"] as const,
  repos: ["repos"] as const,
  repo: (id: string) => ["repo", id] as const,
  members: (id: string) => ["repo", id, "members"] as const,
  branches: (id: string) => ["repo", id, "branches"] as const,
  tree: (id: string, ref: string, path: string) => ["repo", id, "tree", ref, path] as const,
  file: (id: string, ref: string, path: string) => ["repo", id, "file", ref, path] as const,
  commits: (id: string, ref: string, path: string, skip: number) => ["repo", id, "commits", ref, path, skip] as const,
  commit: (id: string, sha: string) => ["repo", id, "commit", sha] as const,
  diff: (id: string, base: string, head: string) => ["repo", id, "diff", base, head] as const,
  repoActivity: (id: string) => ["repo", id, "activity"] as const,
  myActivity: ["activity", "me"] as const,
  notifications: ["notifications"] as const,
  jobs: ["jobs"] as const,
  job: (id: string) => ["jobs", id] as const,
  results: (id: string) => ["jobs", id, "results"] as const,
  repoLanguages: (id: string) => ["repo", id, "languages"] as const,
  githubStatus: ["github", "status"] as const,
  githubRepos: ["github", "repos"] as const,
};

// ---------- reads ----------
export const useMe = (enabled = true) =>
  useQuery({ queryKey: qk.me, queryFn: ({ signal }) => api<User>("/users/me", { signal }), enabled });

/** Unauthenticated ops endpoint: which optional integrations exist + whether a Spark worker is connected. */
export const useReady = () =>
  useQuery({
    queryKey: qk.ready,
    queryFn: async ({ signal }) => {
      const res = await fetch(`${API_BASE}/ready`, { signal });
      return (await res.json()) as Ready;
    },
    refetchInterval: 20_000,
    staleTime: 10_000,
  });

export const REPO_PAGE = 100;
export const useRepos = () =>
  useQuery({
    queryKey: qk.repos,
    // backend caps limit at 100; members of more repos get them by paging
    queryFn: async ({ signal }) => {
      const all: Repo[] = [];
      for (let offset = 0; ; offset += REPO_PAGE) {
        const page = await api<Repo[]>("/repositories", { signal, query: { limit: REPO_PAGE, offset } });
        all.push(...page);
        if (page.length < REPO_PAGE || offset >= 1000) return all;
      }
    },
  });

export const useRepo = (id: string) =>
  useQuery({ queryKey: qk.repo(id), queryFn: ({ signal }) => api<Repo>(`/repositories/${id}`, { signal }) });

export const useMembers = (id: string, enabled = true) =>
  useQuery({ queryKey: qk.members(id), queryFn: ({ signal }) => api<Member[]>(`/repositories/${id}/members`, { signal }), enabled });

export const useBranches = (id: string, enabled = true) =>
  useQuery({ queryKey: qk.branches(id), queryFn: ({ signal }) => api<Branch[]>(`/repositories/${id}/branches`, { signal }), enabled });

export const useTree = (id: string, ref: string, path: string, enabled = true) =>
  useQuery({
    queryKey: qk.tree(id, ref, path),
    queryFn: ({ signal }) => api<Tree>(`/repositories/${id}/tree`, { signal, query: { ref, path } }),
    enabled: enabled && !!ref,
  });

export const useFile = (id: string, ref: string, path: string, enabled = true) =>
  useQuery({
    queryKey: qk.file(id, ref, path),
    queryFn: ({ signal }) => api<FileBlob>(`/repositories/${id}/files`, { signal, query: { ref, path } }),
    enabled: enabled && !!ref && !!path,
  });

export const COMMIT_PAGE = 30;
export const useCommits = (id: string, ref: string, path = "", skip = 0, limit = COMMIT_PAGE) =>
  useQuery({
    queryKey: [...qk.commits(id, ref, path, skip), limit],
    queryFn: ({ signal }) =>
      api<Commit[]>(`/repositories/${id}/commits`, { signal, query: { ref, path, skip, limit } }),
    enabled: !!ref,
  });

/** No single-commit endpoint exists: the log starting at a sha, limit 1, is that commit. */
export const useCommit = (id: string, sha: string) =>
  useQuery({
    queryKey: qk.commit(id, sha),
    queryFn: async ({ signal }) => {
      const [c] = await api<Commit[]>(`/repositories/${id}/commits`, { signal, query: { ref: sha, limit: 1 } });
      return c ?? null;
    },
    staleTime: Infinity, // commits are immutable
  });

export const useDiff = (id: string, base: string | undefined, head: string | undefined) =>
  useQuery({
    queryKey: qk.diff(id, base ?? "", head ?? ""),
    queryFn: ({ signal }) => api<Diff>(`/repositories/${id}/diff`, { signal, query: { base, head } }),
    enabled: !!base && !!head,
  });

export const useRepoActivity = (id: string, limit = 50) =>
  useQuery({
    queryKey: [...qk.repoActivity(id), limit],
    queryFn: ({ signal }) => api<ActivityEvent[]>(`/repositories/${id}/activity`, { signal, query: { limit } }),
  });

export const useMyActivity = (limit = 100) =>
  useQuery({
    queryKey: [...qk.myActivity, limit],
    queryFn: ({ signal }) => api<ActivityEvent[]>("/users/me/activity", { signal, query: { limit } }),
  });

export const useNotifications = () =>
  useQuery({
    queryKey: qk.notifications,
    queryFn: ({ signal }) => api<Notification[]>("/users/me/notifications", { signal, query: { limit: 30 } }),
    refetchInterval: 60_000,
  });

export const useJobs = (limit = 50) =>
  useQuery({
    queryKey: [...qk.jobs, "list", limit],
    queryFn: ({ signal }) => api<Job[]>("/analytics/jobs", { signal, query: { limit } }),
  });

/** pollMs: fallback polling while the live stream is down */
export const useJob = (id: string, pollMs: number | false = false) =>
  useQuery({ queryKey: qk.job(id), queryFn: ({ signal }) => api<Job>(`/analytics/jobs/${id}`, { signal }), refetchInterval: pollMs });

export const useJobResults = (id: string, enabled: boolean) =>
  useQuery({
    queryKey: qk.results(id),
    queryFn: ({ signal }) => api<JobResults>(`/analytics/jobs/${id}/results`, { signal }),
    enabled,
    staleTime: Infinity,
  });

/** Whether GitHub is configured on this server and connected for this user. */
export const useGithubStatus = (enabled = true) =>
  useQuery({
    queryKey: qk.githubStatus,
    queryFn: ({ signal }) => api<GithubStatus>("/github/status", { signal }),
    enabled,
    staleTime: 60_000,
  });

/** The connected account's repositories. Hits the GitHub API, so it is not refetched eagerly. */
export const useGithubRepos = (enabled: boolean) =>
  useQuery({
    queryKey: qk.githubRepos,
    queryFn: ({ signal }) => api<GithubRepo[]>("/github/repositories", { signal, timeoutMs: 60_000 }),
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
  });

// ---------- writes ----------
function useInvalidating<TVars, TRes>(fn: (v: TVars) => Promise<TRes>, keys: (v: TVars, r: TRes) => QueryKey[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r, v) => Promise.all(keys(v, r).map((queryKey) => qc.invalidateQueries({ queryKey }))),
  });
}

export const useCreateRepo = () =>
  useInvalidating(
    (b: { name: string; description: string; visibility: Visibility; default_branch: string }) =>
      api<Repo>("/repositories", { method: "POST", body: b }),
    () => [qk.repos, qk.myActivity],
  );

export const useUpdateRepo = (id: string) =>
  useInvalidating(
    (b: { description?: string; visibility?: Visibility }) => api<Repo>(`/repositories/${id}`, { method: "PATCH", body: b }),
    () => [qk.repo(id), qk.repos],
  );

export const useDeleteRepo = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/repositories/${id}`, { method: "DELETE" }),
    onSuccess: (_r, id) => {
      qc.removeQueries({ queryKey: qk.repo(id) });
      return qc.invalidateQueries({ queryKey: qk.repos });
    },
  });
};

export const useSetMember = (id: string) =>
  useInvalidating(
    (b: { email: string; role: "reader" | "writer" | "admin" }) =>
      api<Member>(`/repositories/${id}/members`, { method: "PUT", body: b }),
    () => [qk.members(id), qk.repoActivity(id)],
  );

export const useRemoveMember = (id: string) =>
  useInvalidating(
    (userId: string) => api<void>(`/repositories/${id}/members/${userId}`, { method: "DELETE" }),
    () => [qk.members(id), qk.repos, qk.repoActivity(id)],
  );

export const useCreateBranch = (id: string) =>
  useInvalidating(
    (b: { name: string; from_ref?: string }) => api<{ name: string; sha: string }>(`/repositories/${id}/branches`, { method: "POST", body: b }),
    () => [qk.branches(id), qk.repoActivity(id), qk.myActivity],
  );

export const useCommitFiles = (id: string) =>
  useInvalidating(
    (b: { branch: string; message: string; changes: FileChange[]; expected_parent?: string }) =>
      api<{ sha: string; branch: string }>(`/repositories/${id}/commits`, { method: "POST", body: b, timeoutMs: 60_000 }),
    // tree/file/commits/branches under this repo all move with a new commit
    () => [qk.repo(id), qk.myActivity],
  );

export const useExportRepo = (id: string) =>
  useMutation({ mutationFn: () => api<ExportResult>(`/repositories/${id}/exports`, { method: "POST", timeoutMs: 120_000 }) });

// The nonce proves the callback runs in the browser that started the flow. sessionStorage is
// per-tab and survives the trip out to GitHub and back, and it is never sent anywhere but our API.
const NONCE_KEY = "gitarchy.github.oauth.nonce";

export function takeOAuthNonce(): string {
  try {
    const n = sessionStorage.getItem(NONCE_KEY) ?? "";
    sessionStorage.removeItem(NONCE_KEY); // single use on this side too
    return n;
  } catch {
    return "";
  }
}

/** Step 1 of the OAuth dance: ask the API where to send the browser, and keep the nonce it returns. */
export const useGithubOAuthStart = () =>
  useMutation({
    mutationFn: async (b: { mode: "signin" | "connect"; next?: string }) => {
      const r = await api<{ authorize_url: string; state: string; nonce: string }>("/github/oauth/start", {
        method: "POST",
        body: b,
      });
      try {
        sessionStorage.setItem(NONCE_KEY, r.nonce);
      } catch {
        // private mode with storage blocked: the callback will fail closed rather than silently
        // accepting an unbound state, so surface it now instead of after the round trip
        throw new Error("Browser storage is blocked, so GitHub sign-in can't be completed securely.");
      }
      return r;
    },
  });

/** Step 2: hand ?code/?state plus the stored nonce back to the API. Cold starts are slow here. */
export const useGithubOAuthCallback = () =>
  useMutation({
    mutationFn: (b: { code: string; state: string; nonce: string }) =>
      api<GithubCallbackResult>("/github/oauth/callback", {
        method: "POST",
        body: b,
        timeoutMs: COLD_START_TIMEOUT_MS,
      }),
  });

export const useDisconnectGithub = () =>
  useInvalidating(() => api<void>("/github/connection", { method: "DELETE" }), () => [qk.githubStatus, qk.githubRepos]);

/** One repository per call: a clone can take minutes, so the caller loops and shows progress. */
export const useImportGithubRepo = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { full_name: string; visibility?: Visibility }) =>
      api<ImportResult>("/github/imports", { method: "POST", body: b, timeoutMs: 300_000 }),
    onSuccess: () =>
      Promise.all(
        [qk.repos, qk.myActivity, qk.githubRepos].map((queryKey) => qc.invalidateQueries({ queryKey })),
      ),
  });
};

/** Re-clone an imported repository the server lost. Same cost as an import, so the same timeout. */
export const useRestoreRepo = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<ImportResult>(`/github/imports/${id}/restore`, { method: "POST", timeoutMs: 300_000 }),
    // everything under ["repo", id] was failing with repo_storage_unavailable; it can all load now
    onSuccess: () =>
      Promise.all([["repo", id], qk.repos, qk.myActivity].map((queryKey) => qc.invalidateQueries({ queryKey }))),
  });
};

/** The newest platform survey, served from the server's cache so it renders with no worker. */
export const useSurvey = () =>
  useQuery({
    queryKey: ["survey"],
    queryFn: () => api<Survey>("/analytics/survey"),
    staleTime: 60_000,
  });

/** The last single-repository language breakdown, or null until one has been run. */
export const useRepoLanguages = (id: string) =>
  useQuery({
    queryKey: qk.repoLanguages(id),
    queryFn: () => api<RepoLanguages>(`/analytics/repositories/${id}/languages`),
    staleTime: 60_000,
  });

export const useUpdateMe = () =>
  useInvalidating((b: { display_name: string }) => api<User>("/users/me", { method: "PATCH", body: b }), () => [qk.me]);

export const useUploadAvatar = () =>
  useInvalidating(
    (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api<User>("/users/me/avatar", { method: "PUT", form, timeoutMs: 60_000 });
    },
    () => [qk.me],
  );

export const useDeleteAvatar = () =>
  useInvalidating(() => api<void>("/users/me/avatar", { method: "DELETE" }), () => [qk.me]);

export const useSubmitJob = () =>
  useInvalidating(
    (b: { task_type: TaskType; params: Record<string, unknown>; repo_ids?: string[]; job_id: string }) =>
      api<Job>("/analytics/jobs", { method: "POST", body: b }),
    () => [qk.jobs],
  );

export const useCancelJob = () =>
  useInvalidating((jobId: string) => api<Job>(`/analytics/jobs/${jobId}/cancel`, { method: "POST" }), (id) => [qk.job(id), qk.jobs]);

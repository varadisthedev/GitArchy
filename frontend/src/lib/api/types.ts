// Shapes mirror the FastAPI backend (backend/app/modules/**, backend/app/integrations/git/manager.py).
// Datetimes arrive as ISO strings.

export type Role = "reader" | "writer" | "admin" | "owner";
export type Visibility = "public" | "private";

export interface User {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

export interface Repo {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  visibility: Visibility;
  default_branch: string;
  created_at: string;
  updated_at: string;
  role: Role;
  /** "owner/name" on GitHub when this repository was imported, else null. */
  source: string | null;
  /** The server has the metadata but not the Git data (ephemeral disk). Imported repos can be restored. */
  storage_missing: boolean;
}

export interface Member {
  user_id: string;
  role: Role;
  display_name: string | null;
}

export interface Branch {
  name: string;
  sha: string;
  updated_at: string;
  is_default: boolean;
}

export type EntryType = "file" | "dir" | "symlink" | "submodule";

export interface TreeEntry {
  name: string;
  type: EntryType;
  mode: string;
  sha: string;
  size: number | null;
}

export interface Tree {
  ref: string;
  commit: string;
  path: string;
  entries: TreeEntry[];
}

export interface FileBlob {
  path: string;
  ref: string;
  commit: string;
  size: number;
  encoding: "utf-8" | "base64";
  content: string;
  is_symlink: boolean;
}

export interface Commit {
  sha: string;
  author_name: string;
  author_email: string;
  date: string;
  parents: string[];
  message: string; // subject line only
}

export interface DiffFile {
  path: string;
  additions: number | null;
  deletions: number | null;
  binary: boolean;
}

export interface Diff {
  base: string;
  head: string;
  files: DiffFile[];
  patch: string;
  truncated: boolean;
}

export type FileChange =
  | { path: string; content: string; encoding?: "utf-8" | "base64" }
  | { path: string; delete: true };

export interface ActivityEvent {
  id: string;
  type:
    | "repo.created"
    | "repo.imported"
    | "repo.restored"
    | "repo.updated"
    | "branch.created"
    | "commit.created"
    | "member.set"
    | "member.removed"
    | string;
  actor_id: string;
  repo_id: string;
  data: Record<string, unknown>;
  ts: string;
}

export interface Notification {
  id: string;
  type: "repo.invited" | string;
  data: Record<string, unknown>;
  read: boolean;
  ts: string;
}

// ---- github ----
export interface GithubStatus {
  configured: boolean;
  connected: boolean;
  login: string | null;
  avatar_url: string | null;
  can_import_private: boolean;
}

export interface GithubRepo {
  full_name: string;
  name: string;
  owner: string;
  description: string;
  private: boolean;
  fork: boolean;
  archived: boolean;
  empty: boolean;
  default_branch: string;
  language: string | null;
  size_kb: number;
  stars: number;
  pushed_at: string | null;
  /** a repository of this name already exists here (matched by name, so it can be a false positive) */
  imported: boolean;
  /** false when empty or over the server's size limit */
  importable: boolean;
}

export interface ImportResult {
  repo: Repo;
  source: string;
  branches: number;
  commits_indexed: number;
}

export interface GithubCallbackResult {
  mode: "signin" | "connect";
  login: string | null;
  next: string | null;
  token: TokenResponse | null;
}

export interface ExportResult {
  key: string;
  sha256: string;
  size: number;
  download_url: string;
  expires_in: number;
}

// ---- analytics ----
export type TaskType =
  | "commit_activity_rdd"
  | "message_terms_mapreduce"
  | "file_stats_sql"
  | "repo_clustering_kmeans"
  | "language_breakdown"
  | "platform_survey";

export type JobStatus = "queued" | "dispatched" | "running" | "succeeded" | "failed" | "cancelled";

export interface Job {
  id: string;
  task_type: TaskType;
  params: Record<string, unknown>;
  repo_ids: string[];
  status: JobStatus;
  attempts: number;
  error: string | null;
  metrics: JobMetrics | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
  worker_available?: boolean;
  status_detail?: "worker_unavailable";
  created?: boolean;
}

export interface JobMetrics {
  duration_s?: number;
  queue_wait_s?: number;
  wall_s?: number;
  worker_id?: string;
  [k: string]: unknown;
}

export interface JobResults {
  job_id: string;
  task_type: TaskType;
  result: unknown;
  metrics: JobMetrics | null;
}

export type JobStreamEvent =
  | { type: "snapshot"; status: JobStatus; error: string | null }
  | { type: "status"; status: JobStatus; error: string | null }
  | { type: "progress"; percent: number; message: string };

// result payloads produced by backend/colab_worker/tasks.py
export interface ActivityResult {
  group_by: "author" | "day" | "hour";
  groups: { key: string; commits: number; additions: number; deletions: number }[];
  total_commits: number;
}
export interface TermsResult {
  top_terms: { term: string; count: number }[];
  messages: number;
}
export interface FileStatsResult {
  by_extension: { ext: string; files: number; commits: number }[];
  by_repo: { repo_id: string; commits: number; additions: number; deletions: number; avg_files_per_commit: number }[];
}
export interface KMeansResult {
  k: number;
  silhouette: number | null;
  training_cost: number;
  clusters: { cluster: number; size: number; repo_ids: string[]; mean: Record<string, number> }[];
}
/** One slice of a survey bar. Aggregate only: the server never puts a user or repo in these. */
export interface SurveyGroup {
  label: string;
  count: number;
  share: number;
}
export interface SurveyResult {
  accounts: number;
  repos: number;
  files: number;
  commits: number;
  languages: SurveyGroup[];
  visibility: SurveyGroup[];
  message_lengths: SurveyGroup[];
}
export interface SurveyRun {
  measured_at: string;
  result: SurveyResult;
}
export interface Survey {
  result: SurveyResult | null;
  job_id: string | null;
  measured_at: string | null;
  history: SurveyRun[];
  worker_available: boolean;
}

export interface RepoLanguages {
  result: LanguagesResult | null;
  job_id: string | null;
  finished_at: string | null;
}
export interface LanguagesResult {
  total_bytes: number;
  total_files: number;
  repos: number;
  languages: { language: string; bytes: number; files: number; share: number }[];
  top_files: { name: string; count: number; share: number }[];
}

export interface Ready {
  status: "ready" | "not_ready";
  checks: { database: string; git: string };
  optional: { r2: "ok" | "off" | "unavailable"; cloudinary: boolean; analytics_enabled: boolean; spark_worker_connected: boolean };
}

export const RANK: Record<Role, number> = { reader: 1, writer: 2, admin: 3, owner: 4 };
export const atLeast = (role: Role | undefined, min: Role) => !!role && RANK[role] >= RANK[min];

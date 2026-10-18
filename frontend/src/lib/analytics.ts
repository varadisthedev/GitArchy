import type { TaskType } from "@/lib/api/types";

// Mirrors backend/app/integrations/spark/protocol.py (param models are strict; unknown keys rejected).
export type ParamSpec =
  | { key: string; label: string; kind: "select"; options: { value: string; label: string }[]; default: string }
  | { key: string; label: string; kind: "int" | "float"; min: number; max: number; step: number; default: number; hint?: string };

export type TaskMeta = {
  type: TaskType;
  title: string;
  summary: string;
  spark: string;
  needs?: string;
  /** Scope is the whole platform, so it takes no repository selection and runs from /survey. */
  global?: true;
  params: ParamSpec[];
};

const SEED: ParamSpec = { key: "seed", label: "Random seed", kind: "int", min: 0, max: 2 ** 31 - 1, step: 1, default: 42, hint: "Same seed, same data → same result." };

export const TASKS: TaskMeta[] = [
  {
    type: "commit_activity_rdd",
    title: "Commit activity",
    summary: "Commits, additions and deletions grouped by author, day, or hour of day.",
    spark: "RDD map + reduceByKey",
    params: [
      {
        key: "group_by", label: "Group by", kind: "select", default: "day",
        options: [
          { value: "day", label: "Day" },
          { value: "author", label: "Author" },
          { value: "hour", label: "Hour of day (UTC)" },
        ],
      },
    ],
  },
  {
    type: "message_terms_mapreduce",
    title: "Commit message terms",
    summary: "The most frequent words across commit messages, counted MapReduce-style.",
    spark: "RDD flatMap + map + reduceByKey",
    params: [{ key: "top_n", label: "Top terms", kind: "int", min: 1, max: 100, step: 1, default: 20 }],
  },
  {
    type: "file_stats_sql",
    title: "File statistics",
    summary: "Files and commits per extension, plus churn and files-per-commit per repository.",
    spark: "DataFrame + Spark SQL",
    params: [{ key: "top_n", label: "Top extensions", kind: "int", min: 1, max: 100, step: 1, default: 20 }],
  },
  {
    type: "repo_clustering_kmeans",
    title: "Repository clustering",
    summary: "Groups repositories by activity profile (commits, churn, files, authors) with K-Means.",
    spark: "MLlib KMeans",
    needs: "Needs at least k repositories in scope.",
    params: [
      { key: "k", label: "Clusters (k)", kind: "int", min: 2, max: 10, step: 1, default: 3 },
      { key: "max_iter", label: "Max iterations", kind: "int", min: 1, max: 50, step: 1, default: 20 },
      SEED,
    ],
  },
  {
    type: "language_breakdown",
    title: "Language breakdown",
    summary: "What the code is made of: share per language by size, and the filenames that repeat most.",
    spark: "RDD map + reduceByKey",
    needs: "Reads the file tree at each repository's default branch.",
    params: [{ key: "top_files", label: "Top filenames", kind: "int", min: 1, max: 50, step: 1, default: 10 }],
  },
  {
    type: "platform_survey",
    title: "Platform survey",
    summary: "Every repository on the platform at once: popular languages, public vs private, commit message length.",
    spark: "RDD map + reduceByKey",
    needs: "Covers accounts that have connected GitHub. Aggregate only — no account or repository is named.",
    global: true,
    params: [{ key: "top_n", label: "Languages shown", kind: "int", min: 3, max: 30, step: 1, default: 12 }],
  },
];

export const taskMeta = (t: string) => TASKS.find((x) => x.type === t);
export const taskTitle = (t: string) => taskMeta(t)?.title ?? t;
export const defaultParams = (t: TaskType) =>
  Object.fromEntries((taskMeta(t)?.params ?? []).map((p) => [p.key, p.default])) as Record<string, string | number>;

export const ACTIVE_STATUSES = new Set(["queued", "dispatched", "running"]);

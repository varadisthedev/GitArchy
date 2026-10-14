"use client";

import { Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { isApiError } from "@/lib/api/client";
import { useReady, useRepos, useSubmitJob } from "@/lib/api/queries";
import type { TaskType } from "@/lib/api/types";
import { defaultParams, TASKS, taskMeta } from "@/lib/analytics";
import { InlineError, Spinner } from "@/components/ui/states";
import { WorkerStatus } from "./worker-status";

/** Pick a predefined Spark task, set its (strict) params and scope, submit. */
export function JobLauncher({ fixedRepoId }: { fixedRepoId?: string }) {
  const router = useRouter();
  const repos = useRepos();
  const ready = useReady();
  const submit = useSubmitJob();
  const [task, setTask] = useState<TaskType>("commit_activity_rdd");
  const [params, setParams] = useState<Record<string, string | number>>(() => defaultParams("commit_activity_rdd"));
  const [scope, setScope] = useState<"all" | "pick">("all");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  // one id per intended submission: a double click or a retry after a network blip can't create two jobs
  const jobId = useRef<string | null>(null);

  const meta = taskMeta(task)!;
  const disabled = ready.data?.optional.analytics_enabled === false;

  function choose(t: TaskType) {
    setTask(t);
    setParams(defaultParams(t));
    setErr(null);
    jobId.current = null;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submit.isPending) return;
    setErr(null);
    for (const p of meta.params) {
      if (p.kind === "select") continue;
      const v = Number(params[p.key]);
      if (!Number.isFinite(v) || v < p.min || v > p.max || (p.kind === "int" && !Number.isInteger(v)))
        return setErr(`${p.label} must be ${p.kind === "int" ? "a whole number" : "a number"} from ${p.min} to ${p.max}.`);
    }
    const repoIds = fixedRepoId ? [fixedRepoId] : scope === "pick" ? [...picked] : undefined;
    if (repoIds && !repoIds.length) return setErr("Pick at least one repository.");
    if (repoIds && repoIds.length > 20) return setErr("A job can cover at most 20 repositories.");
    if (task === "repo_clustering_kmeans") {
      const n = repoIds?.length ?? repos.data?.length ?? 0;
      if (n < Number(params.k)) return setErr(`Clustering into ${params.k} groups needs at least ${params.k} repositories in scope (you have ${n}).`);
    }
    jobId.current ??= crypto.randomUUID();
    const typed = Object.fromEntries(meta.params.map((p) => [p.key, p.kind === "select" ? params[p.key] : Number(params[p.key])]));
    try {
      const job = await submit.mutateAsync({ task_type: task, params: typed, repo_ids: repoIds, job_id: jobId.current });
      jobId.current = null;
      router.push(`/analytics/jobs/${job.id}`);
    } catch (e) {
      if (isApiError(e) && e.status < 500 && e.status !== 0) jobId.current = null; // rejected: next try is a new job
    }
  }

  return (
    <form id="new-job" onSubmit={onSubmit} className="scroll-mt-20" aria-labelledby="nj-h">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3 border-b border-line pb-2">
        <h2 id="nj-h" className="text-lg font-bold">New analytics job</h2>
        <WorkerStatus />
      </div>

      <fieldset disabled={disabled} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div>
          <legend className="label">Operation</legend>
          <div role="radiogroup" aria-label="Operation" className="divide-y divide-line-soft rounded-md border border-line">
            {TASKS.map((t) => (
              <label key={t.type} className="flex cursor-pointer items-start gap-3 px-3.5 py-3 transition-colors hover:bg-surface/50 has-[:checked]:bg-surface">
                <input type="radio" name="task" className="mt-1" checked={task === t.type} onChange={() => choose(t.type)} />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-bold">{t.title}</span>
                    <span className="font-mono text-[0.6875rem] text-fg-3">{t.spark}</span>
                  </span>
                  <span className="mt-0.5 block text-xs text-fg-2">{t.summary}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-5">
          <div className="space-y-4">
            <p className="label !mb-0">Parameters</p>
            {meta.params.map((p) => (
              <div key={`${task}-${p.key}`}>
                <label htmlFor={`p-${p.key}`} className="mb-1 block text-xs text-fg-2">{p.label}</label>
                {p.kind === "select" ? (
                  <select id={`p-${p.key}`} className="select" value={String(params[p.key])} onChange={(e) => setParams((s) => ({ ...s, [p.key]: e.target.value }))}>
                    {p.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <>
                    <input
                      id={`p-${p.key}`} type="number" inputMode={p.kind === "int" ? "numeric" : "decimal"} className="input font-mono text-[0.8125rem]"
                      min={p.min} max={p.max} step={p.step} value={params[p.key]}
                      onChange={(e) => setParams((s) => ({ ...s, [p.key]: e.target.value }))}
                      aria-describedby={`p-${p.key}-h`}
                    />
                    <p id={`p-${p.key}-h`} className="hint">{p.min}–{p.max}{p.hint ? `. ${p.hint}` : ""}</p>
                  </>
                )}
              </div>
            ))}
            {meta.needs ? <p className="text-2xs text-fg-3">{meta.needs}</p> : null}
          </div>

          {!fixedRepoId ? (
            <fieldset>
              <legend className="label">Repositories</legend>
              <div className="flex gap-4 text-xs">
                <label className="flex items-center gap-1.5"><input type="radio" name="scope" checked={scope === "all"} onChange={() => setScope("all")} /> All of mine</label>
                <label className="flex items-center gap-1.5"><input type="radio" name="scope" checked={scope === "pick"} onChange={() => setScope("pick")} /> Choose</label>
              </div>
              {scope === "pick" ? (
                <ul className="mt-2 max-h-48 divide-y divide-line-soft overflow-auto rounded-md border border-line">
                  {(repos.data ?? []).map((r) => (
                    <li key={r.id}>
                      <label className="flex items-center gap-2.5 px-3 py-1.5 text-xs hover:bg-surface/50">
                        <input
                          type="checkbox"
                          checked={picked.has(r.id)}
                          onChange={(e) =>
                            setPicked((s) => {
                              const n = new Set(s);
                              if (e.target.checked) n.add(r.id);
                              else n.delete(r.id);
                              return n;
                            })
                          }
                        />
                        <span className="truncate font-semibold">{r.name}</span>
                      </label>
                    </li>
                  ))}
                  {repos.data && !repos.data.length ? <li className="px-3 py-2 text-xs text-fg-3">No repositories yet.</li> : null}
                </ul>
              ) : (
                <p className="hint">Up to 20 of the repositories you can read.</p>
              )}
            </fieldset>
          ) : null}

          {err ? <p role="alert" className="text-xs text-err">{err}</p> : null}
          {submit.error ? <InlineError error={submit.error} /> : null}
          <button type="submit" className="btn btn-primary h-9 w-full" disabled={submit.isPending || disabled}>
            {submit.isPending ? <><Spinner /> Submitting…</> : <><Play aria-hidden /> Run {meta.title.toLowerCase()}</>}
          </button>
          {ready.data && ready.data.optional.analytics_enabled && !ready.data.optional.spark_worker_connected ? (
            <p className="text-2xs text-fg-3">No worker is connected. The job will wait in the queue and start when one connects. You can keep working meanwhile.</p>
          ) : null}
        </div>
      </fieldset>
      {disabled ? <p className="mt-3 text-xs text-fg-2">Analytics is turned off on this server (no worker token configured). Everything else in Gitarchy works normally.</p> : null}
    </form>
  );
}

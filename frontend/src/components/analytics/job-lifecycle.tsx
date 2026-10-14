import { Hourglass } from "lucide-react";
import type { Job } from "@/lib/api/types";
import { fullDate, relTime } from "@/lib/format";

type Step = { key: string; title: string; detail?: React.ReactNode; at?: string | null; tone: string; live?: boolean; icon?: boolean; state: "done" | "current" | "pending" };

/** The job's life on the commit spine: queued → dispatched → running → terminal. */
export function JobLifecycle({ job, progress }: { job: Job; progress: { percent: number; message: string } | null }) {
  const order = { queued: 0, dispatched: 1, running: 2, succeeded: 3, failed: 3, cancelled: 3 } as const;
  const at = order[job.status];
  const waiting = job.status === "queued" && job.status_detail === "worker_unavailable";
  const st = (i: number): Step["state"] => (i < at ? "done" : i === at ? "current" : "pending");

  const steps: Step[] = [
    {
      key: "queued",
      title: waiting ? "Queued: waiting for a Spark worker" : "Queued",
      detail: waiting
        ? "No worker is connected to the API right now. The job stays queued and is dispatched automatically when one connects. You can leave this page."
        : job.status === "queued"
          ? "Waiting for a free worker slot."
          : undefined,
      at: job.created_at,
      // current never looks like pending: waiting for a worker is amber, like the "No worker connected" ring
      tone: st(0) === "done" ? "solid" : "warn",
      live: job.status === "queued" && !waiting,
      icon: job.status === "queued",
      state: st(0),
    },
    {
      key: "dispatched",
      title: "Dispatched to worker",
      detail: job.status === "dispatched" ? "The worker received the dataset and is starting Spark." : undefined,
      tone: st(1) === "pending" ? "idle" : st(1) === "done" ? "solid" : "info",
      live: job.status === "dispatched",
      state: st(1),
    },
    {
      key: "running",
      title: "Running on Spark",
      at: job.started_at,
      detail:
        job.status === "running" ? (
          <div className="mt-2 max-w-sm">
            <div
              role="progressbar"
              aria-label="Job progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress?.percent}
              aria-valuetext={progress ? `${progress.percent}%: ${progress.message}` : "Running"}
              className="h-1.5 overflow-hidden rounded-full bg-surface"
            >
              <div className="h-full rounded-full bg-warn transition-[width] duration-500 ease-[var(--ease-out)]" style={{ width: `${progress?.percent ?? 4}%` }} />
            </div>
            <p className="mt-1.5 font-mono text-2xs text-fg-2">
              {progress ? `${progress.percent}% · ${progress.message || "working"}` : "Waiting for the first progress report…"}
            </p>
          </div>
        ) : undefined,
      tone: st(2) === "pending" ? "idle" : st(2) === "done" ? "solid" : "warn",
      live: job.status === "running",
      state: st(2),
    },
    {
      key: "done",
      title: job.status === "succeeded" ? "Succeeded" : job.status === "failed" ? "Failed" : job.status === "cancelled" ? "Cancelled" : "Result",
      at: job.finished_at,
      detail:
        job.status === "failed" && job.error ? (
          <p className="mt-1 max-w-[60ch] rounded-sm bg-[var(--del-bg)] px-2 py-1.5 font-mono text-2xs text-err">{job.error}</p>
        ) : job.status === "cancelled" ? (
          "Cancelled before a worker picked it up."
        ) : undefined,
      tone: job.status === "succeeded" ? "ok" : job.status === "failed" ? "err" : "idle",
      state: at === 3 ? "current" : "pending",
    },
  ];

  return (
    <ol className="spine" aria-label="Job lifecycle">
      {steps.map((s) => (
        <li key={s.key} className="pb-5" aria-current={s.state === "current" ? "step" : undefined}>
          <span className="spine-node" data-tone={s.tone} data-live={s.live ? "true" : undefined} />
          <div className={`pt-0.5 ${s.state === "pending" ? "opacity-55" : ""}`}>
            <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold">
              {s.icon ? <Hourglass className="size-3.5 self-center text-warn" aria-hidden /> : null}
              {s.title}
              {s.at && s.state !== "pending" ? (
                <time dateTime={s.at} title={fullDate(s.at)} className="text-2xs font-normal text-fg-3">{relTime(s.at)}</time>
              ) : null}
              <span className="sr-only">({s.state})</span>
            </p>
            {s.detail ? <div className="mt-0.5 text-xs text-fg-2">{s.detail}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { API_V1, getAuthToken } from "@/lib/api/client";
import { qk } from "@/lib/api/queries";
import type { Job, JobStatus, JobStreamEvent } from "@/lib/api/types";

const TERMINAL = new Set<JobStatus>(["succeeded", "failed", "cancelled"]);
export type StreamState = "connecting" | "live" | "closed" | "unavailable";

/**
 * Live job progress over the backend's authorised WebSocket (/analytics/jobs/{id}/stream).
 * The JWT goes in the first frame, never the URL. Status events are written into the react-query cache
 * so every view of this job updates; progress lives here. Reconnects with backoff until the job is terminal.
 */
export function useJobStream(jobId: string, status: JobStatus | undefined) {
  const qc = useQueryClient();
  const [progress, setProgress] = useState<{ percent: number; message: string } | null>(null);
  const [state, setState] = useState<StreamState>("connecting");
  const active = !!status && !TERMINAL.has(status);

  useEffect(() => {
    if (!active) return;
    let ws: WebSocket | null = null;
    let tries = 0;
    let stopped = false;
    let timer: number | undefined;

    const applyStatus = (s: JobStatus, error: string | null) => {
      qc.setQueryData<Job>(qk.job(jobId), (j) => (j ? { ...j, status: s, error, ...(s !== "queued" ? { status_detail: undefined } : {}) } : j));
      if (TERMINAL.has(s)) {
        stopped = true;
        qc.invalidateQueries({ queryKey: qk.jobs }); // refresh job (metrics, timestamps) + lists + results
      }
    };

    const connect = () => {
      const token = getAuthToken();
      if (!token || stopped) return;
      setState("connecting");
      ws = new WebSocket(`${API_V1.replace(/^http/, "ws")}/analytics/jobs/${jobId}/stream`);
      ws.onopen = () => {
        tries = 0;
        ws?.send(JSON.stringify({ type: "auth", token }));
        setState("live");
      };
      ws.onmessage = (m) => {
        let ev: JobStreamEvent;
        try {
          ev = JSON.parse(m.data);
        } catch {
          return;
        }
        if (ev.type === "progress") setProgress({ percent: ev.percent, message: ev.message });
        else applyStatus(ev.status, ev.error);
      };
      ws.onclose = (e) => {
        if (stopped) return setState("closed");
        // 1008 = auth/rate-limit rejection: retrying with the same token won't help
        if (e.code === 1008 || tries >= 6) return setState("unavailable");
        tries++;
        setState("connecting");
        timer = window.setTimeout(connect, Math.min(15_000, 1000 * 2 ** tries));
      };
    };
    connect();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      ws?.close();
    };
  }, [jobId, active, qc]);

  return { progress: active ? progress : null, stream: active ? state : "closed" };
}

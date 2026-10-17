"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { API_BASE } from "./client";

// Render's free tier spins the backend down after ~15 min idle and the next request pays a ~50s cold boot.
// Every page view pokes /health so the service is usually warm before the user submits anything.
const COOLDOWN_MS = 5 * 60_000;
let lastPing = 0;

export function pingBackend() {
  if (typeof window === "undefined" || Date.now() - lastPing < COOLDOWN_MS) return;
  lastPing = Date.now();
  // no-cors: the request only has to arrive. The response is opaque and unused, so /health
  // doesn't need to be in the backend's CORS allowlist and a failure never reaches the console as an error.
  void fetch(`${API_BASE}/health`, { mode: "no-cors", cache: "no-store", keepalive: true }).catch(() => {});
}

/** Mounted once in the root providers: pings on first load and on every navigation. Renders nothing. */
export function BackendWake() {
  const pathname = usePathname();
  useEffect(() => {
    pingBackend();
  }, [pathname]);
  return null;
}

"use client";

import { CircleAlert, CircleCheck, X } from "lucide-react";
import { createContext, use, useCallback, useMemo, useState, type ReactNode } from "react";

// Used sparingly: for outcomes that happen after navigation (created, deleted, committed).
// Inline feedback is preferred everywhere else.
type Toast = { id: number; tone: "ok" | "err"; title: string; body?: string };
const Ctx = createContext<(t: Omit<Toast, "id">) => void>(() => {});
let seq = 0;

export function Toaster({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = ++seq;
      setToasts((ts) => [...ts.slice(-2), { ...t, id }]);
      window.setTimeout(() => dismiss(id), t.tone === "err" ? 8000 : 5000);
    },
    [dismiss],
  );
  const value = useMemo(() => push, [push]);
  return (
    <Ctx value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === "err" ? "alert" : "status"}
            className="pointer-events-auto flex items-start gap-3 rounded-md border border-[#474545] bg-raised px-3.5 py-3 shadow-[0_12px_32px_-8px_rgb(0_0_0/0.6)] [animation:dlg-in_200ms_var(--ease-out)]"
          >
            {t.tone === "ok" ? (
              <CircleCheck className="mt-0.5 size-4 flex-none text-ok" aria-hidden />
            ) : (
              <CircleAlert className="mt-0.5 size-4 flex-none text-err" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-fg">{t.title}</p>
              {t.body ? <p className="mt-0.5 text-2xs text-fg-2">{t.body}</p> : null}
            </div>
            <button className="btn btn-ghost btn-sm btn-icon -mt-1 -mr-1.5" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <X />
            </button>
          </div>
        ))}
      </div>
    </Ctx>
  );
}

export const useToast = () => use(Ctx);

"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { isApiError } from "@/lib/api/client";
import { BackendWake } from "@/lib/api/wake";
import { SessionProvider } from "@/lib/auth/session";
import { Toaster } from "@/components/ui/toast";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // 4xx answers won't change on retry; network blips and 5xx get two more tries
            retry: (count, e) => count < 2 && !(isApiError(e) && e.status >= 400 && e.status < 500),
          },
          mutations: { retry: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <BackendWake />
      <SessionProvider>
        <Toaster>{children}</Toaster>
      </SessionProvider>
    </QueryClientProvider>
  );
}

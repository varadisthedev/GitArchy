import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";

// Everything behind sign-in is rendered in the browser (the JWT lives there), so the prerendered
// static shell is just the loading frame; the URL-reading client hooks stream in under Suspense.
const Loading = () => <div className="min-h-dvh" role="status" aria-label="Loading your workspace" />;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<Loading />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}

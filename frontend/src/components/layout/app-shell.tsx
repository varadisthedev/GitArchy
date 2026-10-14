"use client";

import { BookPlus, ChartNoAxesColumn, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Plus, Settings, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMe } from "@/lib/api/queries";
import { useSession } from "@/lib/auth/session";
import { Avatar } from "@/components/ui/bits";
import { Popover } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/states";
import { Wordmark } from "./logo";
import { Notifications } from "./notifications";
import { RepoSearch } from "./search";
import { SidebarNav } from "./sidebar";

const RAIL_KEY = "gitarchy.rail.collapsed";

export function AppShell({ children }: { children: ReactNode }) {
  const { status, ended } = useSession();
  const router = useRouter();
  const path = usePathname();

  // cold visit without a session; when the session ends in this tab, the session provider redirects instead
  useEffect(() => {
    if (status !== "anon") return;
    const go = () => router.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    if (!ended) return go();
    const t = window.setTimeout(go, 1500); // safety net if we're somehow still mounted after that redirect
    return () => window.clearTimeout(t);
  }, [status, ended, router]);

  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- per-viewer preference from browser storage
      setCollapsed(localStorage.getItem(RAIL_KEY) === "1");
    } catch {}
  }, []);
  const toggleRail = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(RAIL_KEY, c ? "0" : "1");
      } catch {}
      return !c;
    });

  // mobile drawer = native modal dialog (focus trap + Escape)
  const drawer = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    drawer.current?.close();
  }, [path]);

  if (status !== "authed") {
    return (
      <div className="grid min-h-dvh place-items-center" role="status" aria-label="Loading your workspace">
        <Spinner className="size-5 text-fg-3" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only z-50 rounded-md bg-fg px-3 py-2 text-canvas focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 flex h-[var(--topbar-h)] items-center gap-3 border-b border-line bg-shell px-3 sm:px-4">
        <button className="btn btn-ghost btn-icon lg:hidden" aria-label="Open navigation" onClick={() => drawer.current?.showModal()}>
          <Menu />
        </button>
        <button
          className="btn btn-ghost btn-icon hidden lg:inline-flex"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-pressed={!collapsed}
          onClick={toggleRail}
        >
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </button>
        <Link href="/dashboard" aria-label="Gitarchy home" className="mr-2 flex-none rounded-sm">
          <Wordmark />
        </Link>
        <div className="hidden min-w-0 flex-1 sm:block">
          <RepoSearch />
        </div>
        <div className="ml-auto flex items-center gap-1">
          <CreateMenu />
          <Notifications />
          <AccountMenu />
        </div>
      </header>

      <div className="flex">
        <aside
          className={`sticky top-[var(--topbar-h)] hidden h-[calc(100dvh-var(--topbar-h))] flex-none overflow-y-auto border-r border-line bg-shell transition-[width] duration-200 ease-[var(--ease-out)] lg:block ${
            collapsed ? "w-14" : "w-[var(--rail-w)]"
          }`}
        >
          <SidebarNav collapsed={collapsed} />
        </aside>
        <main id="main" className="min-w-0 flex-1 px-4 pt-6 pb-16 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>

      <dialog
        ref={drawer}
        aria-label="Navigation"
        className="m-0 h-dvh max-h-none w-[min(18rem,86vw)] border-r border-line bg-shell p-0 text-fg backdrop:bg-black/60 lg:hidden"
      >
        <div className="flex h-[var(--topbar-h)] items-center justify-between border-b border-line px-3">
          <Wordmark />
          <button className="btn btn-ghost btn-icon" aria-label="Close navigation" onClick={() => drawer.current?.close()}>
            <X />
          </button>
        </div>
        <div className="border-b border-line p-3 sm:hidden">
          <RepoSearch />
        </div>
        <SidebarNav />
      </dialog>
    </div>
  );
}

function CreateMenu() {
  return (
    <Popover button={<><Plus aria-hidden /><span className="hidden md:inline">New</span></>} buttonClassName="btn btn-ghost" label="Create" align="end">
      {(close) => (
        <>
          <Link href="/repositories/new" className="menu-item" onClick={close}>
            <BookPlus aria-hidden /> New repository
          </Link>
          <Link href="/analytics#new-job" className="menu-item" onClick={close}>
            <ChartNoAxesColumn aria-hidden /> New analytics job
          </Link>
        </>
      )}
    </Popover>
  );
}

function AccountMenu() {
  const me = useMe();
  const { logout } = useSession();
  const [busy, setBusy] = useState(false);
  const user = me.data;
  if (!user) return <span className="skel ml-1 size-7 rounded-full" />;
  return (
    <Popover button={<Avatar name={user.display_name} url={user.avatar_url} />} buttonClassName="ml-1 rounded-full" label="Account" align="end">
      {(close) => (
        <>
          <div className="border-b border-[#474545] px-2.5 pt-1.5 pb-2.5">
            <p className="truncate text-sm font-bold">{user.display_name}</p>
            <p className="truncate text-2xs text-fg-3">{user.email}</p>
          </div>
          <div className="pt-1">
            <Link href="/settings" className="menu-item" onClick={close}>
              <Settings aria-hidden /> Profile &amp; settings
            </Link>
            <button
              className="menu-item"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await logout();
              }}
            >
              {busy ? <Spinner /> : <LogOut aria-hidden />} Sign out
            </button>
          </div>
        </>
      )}
    </Popover>
  );
}

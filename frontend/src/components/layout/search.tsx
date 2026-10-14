"use client";

import { BookMarked, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRepos } from "@/lib/api/queries";

// The backend has no search endpoint: this filters the repositories you belong to, client-side.
export function RepoSearch() {
  const repos = useRepos();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const dq = useDeferredValue(q.trim().toLowerCase());
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

  const results = useMemo(() => {
    const all = repos.data ?? [];
    if (!dq) return all.toSorted((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 6);
    return all
      .filter((r) => r.name.toLowerCase().includes(dq) || r.description.toLowerCase().includes(dq))
      .sort((a, b) => Number(!a.name.toLowerCase().startsWith(dq)) - Number(!b.name.toLowerCase().startsWith(dq)))
      .slice(0, 8);
  }, [repos.data, dq]);

  // "/" focuses search from anywhere that isn't a text field
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    setQ("");
    input.current?.blur();
    router.push(href);
  };
  const showAll = q.trim() ? 1 : 0; // trailing "search all" row
  const count = results.length + showAll;

  return (
    <div className="relative w-full max-w-[22rem]">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fg-3" aria-hidden />
      <input
        ref={input}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && count ? `${listId}-${active}` : undefined}
        aria-label="Search your repositories"
        placeholder="Search repositories"
        className="input h-8 border-line bg-canvas pr-8 pl-8 text-xs"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => (a + 1) % Math.max(count, 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + count) % Math.max(count, 1)); }
          else if (e.key === "Escape") { setOpen(false); input.current?.blur(); }
          else if (e.key === "Enter") {
            e.preventDefault();
            if (active < results.length) go(`/repositories/${results[active].id}`);
            else if (q.trim()) go(`/repositories?q=${encodeURIComponent(q.trim())}`);
          }
        }}
      />
      <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded-sm border border-line px-1 font-mono text-[0.6875rem] text-fg-3">
        /
      </kbd>
      {open ? (
        <ul id={listId} role="listbox" aria-label="Repositories" className="menu absolute top-[calc(100%+6px)] right-0 left-0 z-40 max-h-[22rem] overflow-auto">
          {repos.isPending ? <li className="px-2.5 py-2 text-xs text-fg-3">Loading repositories…</li> : null}
          {repos.isSuccess && !results.length && !q.trim() ? (
            <li className="px-2.5 py-2 text-xs text-fg-3">You don&apos;t belong to any repositories yet.</li>
          ) : null}
          {!q.trim() && results.length ? <li role="presentation" className="px-2.5 pt-1.5 pb-1 text-2xs font-semibold text-fg-3">Recently updated</li> : null}
          {results.map((r, i) => (
            <li
              key={r.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => go(`/repositories/${r.id}`)}
              onMouseEnter={() => setActive(i)}
              className={`menu-item ${i === active ? "bg-[#424040]" : ""}`}
            >
              <BookMarked aria-hidden />
              <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
              <span className="text-2xs text-fg-3">{r.visibility}</span>
            </li>
          ))}
          {showAll ? (
            <li
              id={`${listId}-${results.length}`}
              role="option"
              aria-selected={active === results.length}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => go(`/repositories?q=${encodeURIComponent(q.trim())}`)}
              onMouseEnter={() => setActive(results.length)}
              className={`menu-item text-fg-2 ${active === results.length ? "bg-[#424040]" : ""}`}
            >
              <Search aria-hidden />
              All repositories matching “{q.trim()}”
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

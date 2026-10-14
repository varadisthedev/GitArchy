"use client";

import { useCallback, useId, useRef, type ReactNode } from "react";

// Native popover API: top layer (never clipped), light-dismiss, Escape, focus return for free.
// We only position it next to its trigger.
export function Popover({
  button,
  buttonClassName = "btn",
  label,
  align = "start",
  className = "menu",
  children,
  onOpen,
}: {
  button: ReactNode;
  buttonClassName?: string;
  label?: string;
  align?: "start" | "end";
  className?: string;
  children: (close: () => void) => ReactNode;
  onOpen?: () => void;
}) {
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const b = btn.current?.getBoundingClientRect();
    const p = pop.current;
    if (!b || !p) return;
    const w = p.offsetWidth;
    const h = p.offsetHeight;
    let left = align === "end" ? b.right - w : b.left;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    let top = b.bottom + 6;
    if (top + h > window.innerHeight - 8 && b.top - h - 6 > 8) top = b.top - h - 6;
    p.style.left = `${left}px`;
    p.style.top = `${top}px`;
  }, [align]);

  const close = useCallback(() => document.getElementById(id)?.hidePopover(), [id]);

  return (
    <>
      <button ref={btn} type="button" popoverTarget={id} className={buttonClassName} aria-label={label}>
        {button}
      </button>
      <div
        ref={pop}
        id={id}
        popover="auto"
        className={`fixed ${className}`}
        onToggle={(e) => {
          if ((e as unknown as ToggleEvent).newState === "open") {
            place();
            onOpen?.();
            const first = pop.current?.querySelector<HTMLElement>("[data-autofocus], input, a, button");
            first?.focus();
          }
        }}
        onKeyDown={(e) => {
          // arrow-key travel between items
          if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
          const items = Array.from(pop.current?.querySelectorAll<HTMLElement>(".menu-item") ?? []);
          if (!items.length) return;
          e.preventDefault();
          const i = items.indexOf(document.activeElement as HTMLElement);
          const next = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
          items[next].focus();
        }}
      >
        {children(close)}
      </div>
    </>
  );
}

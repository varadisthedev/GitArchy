"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

// Native <dialog>: focus trap, Escape and inert background come from the platform.
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="dlg-title"
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {open ? (
        <div className="p-5">
          <div className="flex items-start justify-between gap-4">
            <h2 id="dlg-title" className="text-lg font-bold tracking-[-0.01em]">
              {title}
            </h2>
            <button className="btn btn-ghost btn-sm btn-icon -mt-0.5 -mr-1.5" onClick={onClose} aria-label="Close">
              <X />
            </button>
          </div>
          {description ? <div className="mt-1.5 text-sm text-fg-2">{description}</div> : null}
          <div className="mt-4">{children}</div>
        </div>
      ) : null}
    </dialog>
  );
}

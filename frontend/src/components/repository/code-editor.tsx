"use client";

import { useMemo, useRef } from "react";

/**
 * Lightweight source editor: native textarea (undo, IME, spellcheck-off, mobile keyboards) plus a line gutter.
 * Tab indents; Escape releases focus so the next Tab leaves the editor (no keyboard trap).
 */
export function CodeEditor({ value, onChange, id, label }: { value: string; onChange: (v: string) => void; id: string; label: string }) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const released = useRef(false);
  const lines = useMemo(() => value.split("\n").length, [value]);
  const indentUnit = useMemo(() => (/^\t/m.test(value) && !/^ {2}/m.test(value) ? "\t" : "  "), [value]);

  function insert(text: string) {
    const el = ta.current!;
    // execCommand keeps the native undo stack; setRangeText is the fallback
    if (!document.execCommand("insertText", false, text)) {
      el.setRangeText(text, el.selectionStart, el.selectionEnd, "end");
      onChange(el.value);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    if (e.key === "Escape") {
      released.current = true;
      return;
    }
    if (e.key === "Tab" && !released.current && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      const { selectionStart: s, selectionEnd: end, value: v } = el;
      const lineStart = v.lastIndexOf("\n", s - 1) + 1;
      if (e.shiftKey) {
        const line = v.slice(lineStart);
        const n = line.startsWith("\t") ? 1 : (line.match(/^ {1,2}/)?.[0].length ?? 0);
        if (n) {
          el.setSelectionRange(lineStart, lineStart + n);
          insert("");
          el.setSelectionRange(Math.max(lineStart, s - n), Math.max(lineStart, end - n));
        }
      } else if (s !== end && v.slice(s, end).includes("\n")) {
        // indent every selected line
        const block = v.slice(lineStart, end);
        el.setSelectionRange(lineStart, end);
        insert(block.replace(/^/gm, indentUnit));
      } else insert(indentUnit);
      return;
    }
    released.current = false;
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      // carry the current line's indentation
      const lineStart = el.value.lastIndexOf("\n", el.selectionStart - 1) + 1;
      const indent = el.value.slice(lineStart).match(/^[\t ]*/)?.[0] ?? "";
      if (indent) {
        e.preventDefault();
        insert("\n" + indent);
      }
    }
  }

  return (
    <div className="code-well max-h-[70vh] min-h-[22rem] overflow-y-auto">
      <div className="flex">
        <div aria-hidden className="sticky left-0 flex-none py-2 select-none">
          {Array.from({ length: lines }, (_, i) => (
            <div key={i} className="code-ln" style={{ width: `calc(${Math.max(3, String(lines).length + 2)}ch + 1.35rem)` }}>
              {i + 1}
            </div>
          ))}
        </div>
        <textarea
          ref={ta}
          id={id}
          aria-label={label}
          aria-describedby={`${id}-help`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          wrap="off"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="block min-w-0 flex-1 resize-none overflow-x-auto overflow-y-hidden bg-transparent py-2 pr-4 text-fg outline-none [line-height:1.35rem] [tab-size:4] whitespace-pre focus-visible:shadow-[inset_0_0_0_1px_var(--stone-2)]"
          style={{ height: `calc(${lines} * 1.35rem + 1rem + 12px)` }}
        />
      </div>
    </div>
  );
}

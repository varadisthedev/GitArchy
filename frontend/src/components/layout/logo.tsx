// The Gitarchy mark: a branch leaving main and merging back reads as an arch.
// Two pillar nodes (main, branch) and the merge node at the apex.
export function Mark({ size = 22, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M5 20.5V12a7 7 0 0 1 14 0v8.5" stroke="var(--stone)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="5" r="2.6" fill="var(--fg)" />
      <circle cx="5" cy="20.5" r="2.1" fill="var(--canvas)" stroke="var(--fg)" strokeWidth="1.6" />
      <circle cx="19" cy="20.5" r="2.1" fill="var(--canvas)" stroke="var(--fg)" strokeWidth="1.6" />
    </svg>
  );
}

export function Wordmark({ size = 22, textClass = "text-[1.0625rem]" }: { size?: number; textClass?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Mark size={size} />
      <span className={`${textClass} font-[750] tracking-[-0.025em] text-fg`}>gitarchy</span>
    </span>
  );
}

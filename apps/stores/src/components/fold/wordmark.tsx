import { cn } from "cn";

// A square with its top-right corner folded down, then the name.
export function FoldMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("size-6", className)}>
      <path d="M2 2h13l7 7v13H2z" fill="currentColor" />
      <path d="M15 2v7h7z" fill="currentColor" opacity="0.45" />
    </svg>
  );
}

export function FoldWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-[26px] font-bold leading-none tracking-[-0.04em]", className)}>
      <FoldMark className="size-[0.85em]" />
      fold
    </span>
  );
}

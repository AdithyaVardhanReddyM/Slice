import { cn } from "cn";

// "fold" set in italic didone and creased down the middle: the right half
// sits in shadow, like a card folded towards you.
export function FoldWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("didone creased-text inline-block pr-[0.08em] italic leading-none", className)}>
      fold
    </span>
  );
}

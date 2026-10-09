import { cn } from "cn";

export function MarlowWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("display inline-block text-[1.9rem] leading-none", className)}>
      Marlow
    </span>
  );
}

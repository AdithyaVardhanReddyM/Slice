import { PlugZap } from "lucide-react";
import { cn } from "@/lib/utils";

/** Resend has no API key yet: a setup note for whoever runs Slice, not an error the merchant caused. */
export function ResendMissing({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-start gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200/70", className)}>
      <PlugZap className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <p className="font-medium">Resend isn&apos;t connected yet</p>
        <p className="mt-0.5 text-amber-900/80">
          Slice sends through Resend. Add <code className="rounded bg-white/70 px-1 font-mono text-xs">RESEND_API_KEY</code> to the Convex environment and
          domains, test emails and campaigns will work. Demo brands keep simulating in the meantime.
        </p>
      </div>
    </div>
  );
}

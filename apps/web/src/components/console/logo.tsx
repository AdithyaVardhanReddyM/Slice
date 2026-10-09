import { cn } from "@/lib/utils";

/** The two-slice logomark, inline so it can sit at any size without a request. */
export function SliceMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 49 34"
      className={cn("h-[17px] w-auto", className)}
      aria-hidden
    >
      <path
        d="M15.4992 0H36.5808L21.0816 22.9729H0L15.4992 0Z"
        fill="#FFE642"
      />
      <path
        d="M16.4224 25.102L10.4192 34H32.5008L48 11.0271H31.7024L22.2064 25.102H16.4224Z"
        fill="#FF7900"
      />
    </svg>
  );
}

export function SliceWordmark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/slice_logo_blktext.svg"
      alt="Slice"
      width={167}
      height={39}
      className={cn("h-[22px] w-auto", className)}
    />
  );
}

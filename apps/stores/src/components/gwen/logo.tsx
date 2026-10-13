import { cn } from "cn";

/** Gold gradient defs, rendered once in the layout and referenced by every mark. */
export function GoldDefs() {
  return (
    <svg width="0" height="0" aria-hidden className="absolute">
      <defs>
        <linearGradient id="gw-gold" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="43" y2="40">
          <stop offset="0" stopColor="#f7e7b4" />
          <stop offset="0.38" stopColor="#e2bc62" />
          <stop offset="0.68" stopColor="#b8872f" />
          <stop offset="1" stopColor="#ecd28c" />
        </linearGradient>
        <linearGradient id="gw-gold-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f3dfa6" />
          <stop offset="0.5" stopColor="#d4a64a" />
          <stop offset="1" stopColor="#f3dfa6" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** The Gwen mark: a slanted G in four pieces, in gold. */
export function Mark({ size = 26, className, style }: { size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={(size * 40) / 43} viewBox="0 0 43 40" aria-hidden className={className} style={style}>
      <g fill="url(#gw-gold)">
        <path d="M3.30396 17.1323C3.71066 15.3021 5.33391 14 7.20871 14H12L8.00002 32H4.98649C2.4275 32 0.526615 29.6303 1.08174 27.1323L3.30396 17.1323Z" />
        <path d="M39.2852 8H21.2861L20.6777 10.8384C20.2824 12.6825 18.6526 14 16.7666 14H12L14.3216 3.16214C14.7167 1.31774 16.3467 0 18.2329 0H36.0513C38.5978 0 40.496 2.34793 39.9626 4.83792L39.2852 8Z" />
        <path d="M30.9627 36.8379C30.5676 38.6823 28.9377 40 27.0514 40H11.233C8.68648 40 6.78828 37.6521 7.32172 35.1621L7.99914 32H31.9991L30.9627 36.8379Z" />
        <path d="M38.6269 17C41.2292 17 43.1386 19.4456 42.5075 21.9701L40.7575 28.9701C40.3123 30.7508 38.7124 32 36.8769 32H32L33.75 25H14L15.0364 20.1621C15.4316 18.3177 17.0615 17 18.9477 17H38.6269Z" />
      </g>
    </svg>
  );
}

export function Wordmark({ className, tone = "ink" }: { className?: string; tone?: "ink" | "light" }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Mark size={27} />
      <span
        className={cn(
          "font-[family-name:var(--font-gw-display)] text-[25px] font-semibold leading-none tracking-[-0.045em]",
          tone === "light" ? "text-white" : "text-gw-ink",
        )}
      >
        gwen
      </span>
    </span>
  );
}

import { ArrowUp, X } from "lucide-react";
import { fmt } from "@/lib/format";
import type { SampleProduct } from "@/lib/mock/setup";
import { cn } from "@/lib/utils";
import { onAccent } from "./color";

// The shopper-facing widget, drawn with its own palette: it's the merchant's
// widget theme, not the console's, so it uses literal colors on purpose.
const THEMES = {
  light: {
    bg: "#ffffff",
    bubble: "#f4f2ec",
    text: "#17150f",
    muted: "#736d5f",
    border: "#e8e3d7",
    card: "#ffffff",
  },
  dark: {
    bg: "#1b1915",
    bubble: "#2a2722",
    text: "#f3f0e8",
    muted: "#a9a291",
    border: "#38342c",
    card: "#23201b",
  },
} as const;

export type WidgetTheme = keyof typeof THEMES;

export function WidgetPanelMock({
  accent,
  theme = "light",
  radius = 14,
  name,
  greeting,
  ask,
  replyLead,
  samples,
  recs,
  className,
}: {
  accent: string;
  theme?: WidgetTheme;
  radius?: number;
  name: string;
  greeting: string;
  ask: string;
  replyLead: string;
  samples: SampleProduct[];
  recs: number;
  className?: string;
}) {
  const t = THEMES[theme];
  const fg = onAccent(accent);
  const bubble = Math.max(4, radius - 2);
  const picks = Array.from(
    { length: recs },
    (_, i) => samples[i % samples.length],
  ).filter(Boolean);

  return (
    <div
      className={cn(
        "overflow-hidden shadow-sm ring-1",
        theme === "dark" ? "ring-white/10" : "ring-black/5",
        className,
      )}
      style={{ background: t.bg, color: t.text, borderRadius: radius }}
    >
      <div
        className="flex items-center gap-2.5 px-3.5 py-3"
        style={{ borderBottom: `1px solid ${t.border}` }}
      >
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
          style={{ background: accent, color: fg }}
        >
          {name.charAt(0) || "C"}
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-sm font-semibold">
            {name || "Concierge"}
          </div>
          <div className="text-xs" style={{ color: t.muted }}>
            Picks from this store only
          </div>
        </div>
        <X className="size-4" style={{ color: t.muted }} />
      </div>

      <div className="space-y-2.5 p-3.5 text-xs leading-snug">
        <p
          className="max-w-[88%] px-3 py-2"
          style={{
            background: t.bubble,
            borderRadius: bubble,
            borderTopLeftRadius: 4,
          }}
        >
          {greeting || "Hi! What are you looking for today?"}
        </p>
        <p
          className="ml-auto max-w-[80%] px-3 py-2"
          style={{
            background: accent,
            color: fg,
            borderRadius: bubble,
            borderTopRightRadius: 4,
          }}
        >
          {ask}
        </p>
        <div className="space-y-1.5">
          <p style={{ color: t.text }}>{replyLead}</p>
          {picks.map((p, i) => (
            <div
              key={`${p.id}-${i}`}
              className="flex items-center gap-2.5 p-1.5"
              style={{
                background: t.card,
                border: `1px solid ${t.border}`,
                borderRadius: Math.max(4, radius - 4),
              }}
            >
              <span
                className="relative block size-8 shrink-0 overflow-hidden"
                style={{
                  background: p.tint ?? t.bubble,
                  borderRadius: Math.max(3, radius - 8),
                }}
              >
                {p.image ? (
                  // Merchant-hosted product photos.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.image}
                    alt=""
                    className="size-full object-cover"
                    loading="lazy"
                  />
                ) : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">
                  {p.title}
                </span>
                <span
                  className="block truncate text-xs"
                  style={{ color: t.muted }}
                >
                  {p.brand ?? p.category}
                </span>
              </span>
              <span className="num pr-1 text-xs font-medium">
                {fmt.money(p.price)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="px-3.5 pb-3.5">
        <div
          className="flex h-9 items-center gap-2 pr-1 pl-3 text-xs"
          style={{
            border: `1px solid ${t.border}`,
            borderRadius: Math.max(6, radius - 2),
            color: t.muted,
          }}
        >
          <span className="flex-1">Ask anything…</span>
          <span
            className="flex size-7 items-center justify-center"
            style={{
              background: accent,
              color: fg,
              borderRadius: Math.max(4, radius - 4),
            }}
          >
            <ArrowUp className="size-4" />
          </span>
        </div>
      </div>
    </div>
  );
}

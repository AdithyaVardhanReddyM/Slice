import { cn } from "cn";
import { Mark } from "./logo";

/**
 * Gwen Reserve, drawn in CSS so it stays sharp at any size. The wrapper is a
 * size container, so every measurement inside is a share of the card's width.
 * Gold carries the detail: mark, wordmark, engraved rings, inset frame, the
 * horizon line and the chip.
 */
export function CardArt({
  finish = "graphite",
  holder = "Alex Morgan",
  glint = false,
  className,
}: {
  finish?: "graphite" | "pearl";
  holder?: string;
  glint?: boolean;
  className?: string;
}) {
  const dark = finish === "graphite";
  return (
    <div className={cn("@container w-full", className)}>
      <div
        className={cn("relative aspect-[1.586] w-full overflow-hidden rounded-[5.2cqw]", dark ? "gw-card-metal text-white" : "gw-card-pearl text-gw-ink")}
        style={{
          boxShadow: dark
            ? "0 1px 0 rgb(255 255 255 / 0.22) inset, 0 0 0 1px rgb(226 188 98 / 0.22) inset, 0 50px 90px -34px rgb(12 15 29 / 0.6), 0 20px 40px -20px rgb(12 15 29 / 0.5)"
            : "0 1px 0 rgb(255 255 255 / 0.95) inset, 0 0 0 1px rgb(184 135 47 / 0.25) inset, 0 50px 90px -34px rgb(12 15 29 / 0.35), 0 20px 40px -20px rgb(12 15 29 / 0.25)",
        }}
        role="img"
        aria-label={`Gwen Reserve card, ${finish} finish`}
      >
        {/* Engraved rings in the corner, like guilloché on a banknote. */}
        <svg viewBox="0 0 100 100" className={cn("absolute -right-[20cqw] -top-[32cqw] size-[86cqw]", dark ? "opacity-[0.28]" : "opacity-[0.4]")} aria-hidden>
          {Array.from({ length: 14 }, (_, i) => (
            <circle key={i} cx="50" cy="50" r={12 + i * 2.7} fill="none" stroke="url(#gw-gold-ring)" strokeWidth={i % 4 === 0 ? 0.34 : 0.16} />
          ))}
        </svg>
        <div className="gw-card-sheen absolute inset-0" />
        {/* Inset gold frame. */}
        <div
          className="absolute inset-[2.4cqw] rounded-[3.4cqw] border-[0.2cqw]"
          style={{ borderColor: dark ? "rgb(226 188 98 / 0.32)" : "rgb(184 135 47 / 0.35)" }}
        />

        <div className="absolute left-[7cqw] top-[7.2cqw] flex items-center gap-[2cqw]">
          <Mark style={{ width: "7.4cqw", height: "auto" }} />
          <span
            className={cn(
              "font-[family-name:var(--font-gw-display)] text-[7.6cqw] font-semibold leading-none tracking-[-0.045em]",
              dark ? "gw-gold-text" : "gw-gold-text-deep",
            )}
          >
            gwen
          </span>
        </div>
        <span
          className={cn(
            "absolute right-[7cqw] top-[9.2cqw] text-[2.3cqw] font-semibold uppercase tracking-[0.34em]",
            dark ? "gw-gold-text" : "gw-gold-text-deep",
          )}
        >
          Reserve
        </span>

        {/* Chip */}
        <div
          className="absolute left-[7cqw] top-[31cqw] h-[10.6cqw] w-[14cqw] overflow-hidden rounded-[2cqw]"
          style={{
            background: "linear-gradient(135deg, #f7e7b4 0%, #d9b05a 40%, #f3dca0 62%, #b8872f 100%)",
            boxShadow: "inset 0 0 0 0.25cqw rgb(120 84 20 / 0.35), 0 0.4cqw 0.8cqw rgb(0 0 0 / 0.25)",
          }}
        >
          <div className="absolute inset-x-[2.2cqw] top-1/2 h-[0.25cqw] -translate-y-1/2 bg-[#7a5418]/35" />
          <div className="absolute inset-y-[1.8cqw] left-1/2 w-[0.25cqw] -translate-x-1/2 bg-[#7a5418]/35" />
          <div className="absolute left-[4.4cqw] top-[2.6cqw] h-[5.4cqw] w-[5.2cqw] rounded-[1cqw] border-[0.25cqw] border-[#7a5418]/35" />
        </div>
        {/* Contactless */}
        <svg
          viewBox="0 0 24 24"
          className={cn("absolute left-[24cqw] top-[32.4cqw] size-[7.6cqw]", dark ? "text-[#e7cd8a]/80" : "text-[#9c7428]/70")}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M8.5 8.5a5 5 0 0 1 0 7" />
          <path d="M12 6a8.5 8.5 0 0 1 0 12" />
          <path d="M15.5 3.5a12 12 0 0 1 0 17" />
        </svg>

        {/* The horizon line, in gold. */}
        <div className="gw-card-foil absolute inset-x-0 top-[71%] h-[0.32cqw]" />

        <span
          className={cn(
            "absolute bottom-[7.2cqw] left-[7cqw] text-[3.1cqw] font-medium uppercase tracking-[0.16em]",
            dark ? "text-white/80" : "text-gw-ink/70",
          )}
        >
          {holder}
        </span>
        <span className="absolute bottom-[6.4cqw] right-[7cqw] flex flex-col items-end leading-none">
          <span className={cn("text-[6.6cqw] font-extrabold italic tracking-[-0.02em]", dark ? "text-white" : "text-gw-ink")}>VISA</span>
          <span className={cn("mt-[0.9cqw] text-[2.4cqw] font-semibold", dark ? "gw-gold-text" : "gw-gold-text-deep")}>Infinite</span>
        </span>

        {glint && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="gw-glint absolute inset-y-[-20%] left-0 w-[35%] bg-[linear-gradient(90deg,transparent,rgb(255_255_255/0.22),transparent)]" />
          </div>
        )}
      </div>
    </div>
  );
}

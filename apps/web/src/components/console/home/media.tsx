import Link from "next/link";
import { ArrowRight, Clapperboard, Film, ImageIcon, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { serviceMeta } from "@/lib/services";
import { SliceMark } from "@/components/console/logo";

// Three made-up audiences, one poster each: what Media will turn a single brief into.
const POSTERS = [
  {
    title: "Lisbon, after dark",
    audience: "Late-night clubbers, 25–34",
    background:
      "radial-gradient(70% 55% at 80% 18%, rgba(255,255,255,0.55), transparent 60%), linear-gradient(165deg, #ffe642 0%, #ffbf00 45%, #ff7900 100%)",
    ink: "#1a1205",
    art: "sphere",
    layout:
      "left-[1%] top-[14%] -rotate-[8deg] group-hover:-rotate-[12deg] group-hover:-translate-x-3",
  },
  {
    title: "Slow mornings",
    audience: "Coffee and vinyl, Porto",
    background:
      "radial-gradient(60% 50% at 30% 22%, rgba(230,255,170,0.7), transparent 65%), linear-gradient(170deg, #b8e07a 0%, #4f8f4a 55%, #173d2c 100%)",
    ink: "#ffffff",
    art: "sunrise",
    layout: "left-[32.5%] top-[4%] z-10 group-hover:-translate-y-2",
  },
  {
    title: "Night owls",
    audience: "Jazz and indie film, Berlin",
    background:
      "radial-gradient(65% 55% at 70% 80%, rgba(255,170,120,0.85), transparent 65%), linear-gradient(170deg, #1d2552 0%, #3b4a8c 50%, #e58a62 100%)",
    ink: "#ffffff",
    art: "waves",
    layout:
      "right-[1%] top-[16%] rotate-[8deg] group-hover:rotate-[12deg] group-hover:translate-x-3",
  },
] as const;

/** Line drawings for the posters, in the poster's ink. */
function PosterArt({ kind }: { kind: (typeof POSTERS)[number]["art"] }) {
  const line = {
    fill: "none",
    stroke: "currentColor",
    strokeOpacity: 0.5,
    strokeWidth: 0.6,
  } as const;
  return (
    <svg viewBox="0 0 100 100" className="mx-auto block w-[72%]" aria-hidden>
      {kind === "sphere" && (
        <>
          {[1, 0.78, 0.55, 0.32, 0.1].map((k) => (
            <ellipse
              key={`h${k}`}
              cx="50"
              cy="50"
              rx="38"
              ry={38 * k}
              {...line}
            />
          ))}
          {[0.78, 0.55, 0.32, 0.1].map((k) => (
            <ellipse
              key={`v${k}`}
              cx="50"
              cy="50"
              rx={38 * k}
              ry="38"
              {...line}
            />
          ))}
          <circle cx="50" cy="50" r="3.2" fill="#1a1205" />
        </>
      )}
      {kind === "sunrise" && (
        <>
          {[8, 16, 24, 32, 40].map((r) => (
            <path
              key={r}
              d={`M${50 - r},78 A${r},${r} 0 0 1 ${50 + r},78`}
              {...line}
            />
          ))}
          <line x1="6" y1="78" x2="94" y2="78" {...line} />
          <circle cx="50" cy="78" r="3.2" fill="#e8ff7a" />
        </>
      )}
      {kind === "waves" && (
        <>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <path
              key={i}
              d={`M8,${30 + i * 7} C26,${18 + i * 7} 38,${42 + i * 7} 50,${30 + i * 7} S74,${18 + i * 7} 92,${30 + i * 7}`}
              {...line}
            />
          ))}
          <circle cx="50" cy="51" r="3.2" fill="#ffd2b0" />
        </>
      )}
    </svg>
  );
}

function Poster({ poster }: { poster: (typeof POSTERS)[number] }) {
  return (
    <div
      className={cn(
        "absolute flex aspect-[4/5] w-[35%] flex-col justify-between overflow-hidden rounded-2xl p-4 shadow-[0_24px_48px_-20px_rgba(0,0,0,0.7)] ring-1 ring-white/15 transition-transform duration-500",
        poster.layout,
      )}
      style={{ background: poster.background, color: poster.ink }}
    >
      <div className="flex items-center justify-between">
        <SliceMark className="h-3" />
        <span className="rounded-full px-1.5 py-px text-[9px] font-semibold ring-1 ring-current/30">
          4:5
        </span>
      </div>
      <PosterArt kind={poster.art} />
      <div>
        <p className="text-[clamp(13px,1.5vw,19px)] leading-[1.05] font-semibold tracking-[-0.02em]">
          {poster.title}
        </p>
        <p className="mt-1 truncate text-[10px] opacity-75">
          {poster.audience}
        </p>
      </div>
    </div>
  );
}

/** Media isn't built yet: a dark banner that shows what it will make, with the way to the plan. */
export function MediaBanner({
  className,
  delay = 0,
}: {
  className?: string;
  delay?: number;
}) {
  const media = serviceMeta("media");
  return (
    <section
      className={cn(
        "home-rise group relative isolate overflow-hidden rounded-3xl bg-neutral-950 text-white",
        className,
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <span
        aria-hidden
        className="absolute -top-40 -right-24 -z-10 size-[30rem] rounded-full bg-[#ff7900]/30 blur-[110px]"
      />
      <span
        aria-hidden
        className="absolute -bottom-48 left-[28%] -z-10 size-[26rem] rounded-full bg-[#ffe642]/15 blur-[110px]"
      />

      <div className="grid items-center gap-10 p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:p-12">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 items-center gap-2 rounded-full bg-white/[0.08] px-3 text-sm font-medium ring-1 ring-white/10">
              <Clapperboard className="size-4" />
              {media.label}
            </span>
            <span className="inline-flex h-6 items-center rounded-full bg-white px-2.5 text-xs font-semibold text-neutral-950">
              Coming soon
            </span>
          </div>
          <h2 className="mt-6 max-w-xl text-3xl leading-[1.08] font-medium tracking-[-0.03em] sm:text-[38px]">
            Campaign creative that changes with the audience
          </h2>
          <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-white/60">
            {media.description}
          </p>
          <ul className="mt-6 flex flex-wrap gap-2">
            {(
              [
                [ImageIcon, "Posters and statics"],
                [Film, "Short video"],
                [Mail, "Email and ad variants"],
              ] as const
            ).map(([Icon, label]) => (
              <li
                key={label}
                className="inline-flex h-8 items-center gap-2 rounded-full bg-white/[0.06] px-3 text-sm text-white/85 ring-1 ring-white/10"
              >
                <Icon className="size-3.5 text-white/60" />
                {label}
              </li>
            ))}
          </ul>
          <Link
            href="/dashboard/media"
            className="mt-8 inline-flex h-10 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-neutral-950 transition-colors hover:bg-white/90"
          >
            See what&apos;s planned
            <ArrowRight className="size-4" />
          </Link>
        </div>

        <div
          className="relative mx-auto aspect-[16/11] w-full max-w-[30rem]"
          aria-hidden
        >
          {POSTERS.map((p) => (
            <Poster key={p.title} poster={p} />
          ))}
        </div>
      </div>
    </section>
  );
}

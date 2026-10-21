import { cn } from "cn";

// White scalloped badge with a round food photo inside, like a sticker on a bag.
const BUMPS = 22;
const R = 100;
const scallops = Array.from({ length: BUMPS }, (_, i) => {
  const a = (i / BUMPS) * Math.PI * 2;
  return { x: R + Math.cos(a) * (R - 9), y: R + Math.sin(a) * (R - 9) };
});

export function Sticker({ src, alt, className, tilt = 0 }: { src: string; alt: string; className?: string; tilt?: number }) {
  return (
    <div className={cn("relative aspect-square drop-shadow-[0_8px_14px_rgb(38_22_13/0.22)]", className)} style={{ ["--kn-tilt" as string]: `${tilt}deg`, transform: `rotate(${tilt}deg)` }}>
      <svg viewBox={`0 0 ${R * 2} ${R * 2}`} className="absolute inset-0 h-full w-full" aria-hidden>
        <circle cx={R} cy={R} r={R - 9} fill="#fff" />
        {scallops.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={9.5} fill="#fff" />
        ))}
        <circle cx={R} cy={R} r={R - 18} fill="none" stroke="#26160d" strokeWidth={1.2} strokeDasharray="3 4" />
      </svg>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="absolute inset-[13%] h-[74%] w-[74%] rounded-full object-cover" />
    </div>
  );
}

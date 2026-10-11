import Link from "next/link";
import { href } from "@/lib/ridgeline";

// The logo is a real SVG file with the brand name in its alt, the way a
// merchant's theme would ship it, so intake can find both.
export function Logo({ className, height = 44 }: { className?: string; height?: number }) {
  return (
    <Link href={href.home} className={className} aria-label="Ridgeline Coffee Roasters home">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/ridgeline/logo.svg"
        alt="Ridgeline Coffee Roasters"
        width={Math.round(height * (320 / 56))}
        height={height}
        className="block"
      />
    </Link>
  );
}

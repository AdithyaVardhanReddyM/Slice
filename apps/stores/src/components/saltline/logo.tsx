import Link from "next/link";
import { href } from "@/lib/saltline";

export function Logo({ className, height = 36 }: { className?: string; height?: number }) {
  return (
    <Link href={href.home} className={className} aria-label="Saltline Hotels home">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/saltline/logo.svg"
        alt="Saltline Hotels"
        width={Math.round(height * (260 / 48))}
        height={height}
        className="block"
      />
    </Link>
  );
}

import Link from "next/link";
import { cn } from "cn";
import { href } from "@/lib/folio/shop";

/** The fern mark and wordmark (public/folio/logo.svg; logo-light.svg on green). */
export function Logo({ tone = "dark", className }: { tone?: "dark" | "light"; className?: string }) {
  return (
    <Link href={href.home} className={cn("inline-flex shrink-0", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={tone === "dark" ? "/folio/logo.svg" : "/folio/logo-light.svg"} alt="Folio & Fern" width={270} height={66} className="h-full w-auto" />
    </Link>
  );
}

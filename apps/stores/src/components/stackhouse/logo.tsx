import Link from "next/link";
import { cn } from "cn";
import { href } from "@/lib/stackhouse/shop";

/** The stacked-books mark and wordmark (public/stackhouse/logo.svg; logo-light.svg on green). */
export function Logo({ tone = "dark", className }: { tone?: "dark" | "light"; className?: string }) {
  return (
    <Link href={href.home} className={cn("inline-flex shrink-0", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={tone === "dark" ? "/stackhouse/logo.svg" : "/stackhouse/logo-light.svg"} alt="Stackhouse Books" width={294} height={48} className="h-full w-auto" />
    </Link>
  );
}

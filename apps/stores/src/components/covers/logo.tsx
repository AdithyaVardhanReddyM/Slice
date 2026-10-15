import Link from "next/link";
import { cn } from "cn";
import { href } from "@/lib/covers/site";

/** The orange plate and "covers" wordmark (public/covers/logo.svg; logo-light.svg on dark brown). */
export function Logo({ tone = "dark", className }: { tone?: "dark" | "light"; className?: string }) {
  return (
    <Link href={href.home} className={cn("inline-flex shrink-0", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={tone === "dark" ? "/covers/logo.svg" : "/covers/logo-light.svg"} alt="Covers" width={172} height={40} className="h-full w-auto" />
    </Link>
  );
}

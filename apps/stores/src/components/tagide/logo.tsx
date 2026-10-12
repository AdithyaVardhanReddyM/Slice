import Link from "next/link";
import { cn } from "cn";
import { href } from "@/lib/tagide";

/** The wordmark is set in the display face; the square mark in /tagide/logo.svg is for favicons and cards. */
export function Wordmark({ className, size = 26 }: { className?: string; size?: number }) {
  return (
    <Link href={href.home} aria-label="Tágide Festival home" className={cn("tg-display inline-block leading-none", className)} style={{ fontSize: size }}>
      Tágide
    </Link>
  );
}

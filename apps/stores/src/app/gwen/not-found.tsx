import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { href } from "@/lib/gwen";

export default function NotFound() {
  return (
    <main className="gw-dawn">
      <div className="gw-container flex min-h-[70svh] flex-col items-center justify-center pb-24 pt-40 text-center">
        <h1 className="gw-display text-[48px] sm:text-[64px]">
          This page took the <span className="gw-serif text-[1.08em]">long way</span> home.
        </h1>
        <p className="mt-4 max-w-md text-[17px] text-gw-ink/70">It isn&apos;t here any more. The card and every perk are on the home page.</p>
        <Link href={href.home} className="gw-btn mt-8 bg-gw-ink text-white hover:bg-gw-ink-3">
          Back to Gwen <ArrowRight className="size-4" />
        </Link>
      </div>
    </main>
  );
}

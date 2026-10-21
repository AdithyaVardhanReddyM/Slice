import Link from "next/link";
import { Header } from "@/components/halfmoon/header";
import { href } from "@/lib/halfmoon/site";

export default function NotFound() {
  return (
    <main>
      <Header />
      <section className="hm-container flex min-h-[60svh] flex-col items-center justify-center py-24 text-center">
        <p className="hm-eyebrow">Page not found</p>
        <h1 className="hm-display mt-4 text-[48px] sm:text-[72px]">New moon. Nothing here.</h1>
        <p className="mt-5 max-w-md text-[17px] leading-relaxed text-(--hm-ink-soft)">This page has waned. Our four roasts are right where you left them.</p>
        <Link href={href.shop} className="hm-btn hm-btn-ink mt-8">
          Shop coffee
        </Link>
      </section>
    </main>
  );
}

import Link from "next/link";
import { Header } from "@/components/knock/header";
import { href } from "@/lib/knock/site";

export default function NotFound() {
  return (
    <main>
      <div className="kn-container">
        <Header />
      </div>
      <section className="kn-container flex min-h-[60svh] flex-col items-center justify-center py-24 text-center">
        <p className="text-[15px] font-semibold text-(--kn-red)">Page not found</p>
        <h1 className="kn-display mt-4 text-[48px] sm:text-[72px]">Nobody answered.</h1>
        <p className="mt-5 max-w-md text-[17px] leading-relaxed text-(--kn-ink-soft)">We knocked, but this page isn&apos;t here any more. Every kitchen we deliver from is one tap away.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href={href.restaurants} className="kn-btn kn-btn-red">
            Find food
          </Link>
          <Link href={href.home} className="kn-btn kn-btn-light">
            Back home
          </Link>
        </div>
      </section>
    </main>
  );
}

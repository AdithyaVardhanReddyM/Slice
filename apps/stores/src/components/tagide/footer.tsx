import Link from "next/link";
import { festival, href, tagide } from "@/lib/tagide";

export function Footer() {
  return (
    <footer className="mt-24 overflow-hidden bg-tg-orange text-white">
      <div className="tg-container grid gap-12 pt-16 lg:grid-cols-[1fr_1fr_1.3fr]">
        <div>
          <h2 className="tg-display text-[28px]">Contact</h2>
          <div className="mt-5 flex flex-col gap-1 text-[15px] font-medium">
            <a href={`mailto:${festival.email}`} className="w-fit hover:underline">
              {festival.email}
            </a>
            <a href={`mailto:${festival.press}`} className="w-fit hover:underline">
              {festival.press}
            </a>
            <span>{festival.phone}</span>
          </div>
          <div className="mt-8 flex flex-col gap-1.5 text-[15px] font-medium">
            <Link href={href.lineup} className="w-fit hover:underline">
              Lineup
            </Link>
            <Link href={href.tickets} className="w-fit hover:underline">
              Tickets
            </Link>
            <Link href={href.travel} className="w-fit hover:underline">
              Travel and camping
            </Link>
            <Link href={href.grounds} className="w-fit hover:underline">
              The grounds
            </Link>
            <Link href={href.info} className="w-fit hover:underline">
              Info and FAQ
            </Link>
          </div>
        </div>
        <div>
          <h2 className="tg-display text-[28px]">Address</h2>
          <address className="mt-5 text-[15px] font-medium not-italic leading-relaxed">
            {festival.address.map((l) => (
              <div key={l}>{l}</div>
            ))}
          </address>
          <p className="mt-6 max-w-xs text-[14px] leading-relaxed text-white/85">
            Festival office: Rua do Açúcar 76, 1950-009 Lisboa. Open Monday to Friday, 10:00 to 18:00.
          </p>
        </div>
        <div className="lg:text-right">
          <p className="ml-auto max-w-sm text-[15px] leading-relaxed text-white/90">{tagide.store.tagline} {festival.edition}. Named for the river nymphs who guided Camões&apos;s ships, and for the river that keeps the city cool in June.</p>
          <form className="mt-8 flex max-w-sm gap-2 lg:ml-auto">
            <label htmlFor="tg-newsletter" className="sr-only">
              Email address
            </label>
            <input
              id="tg-newsletter"
              type="email"
              placeholder="Email for lineup news"
              className="min-w-0 flex-1 rounded-full border-2 border-white/60 bg-transparent px-4 py-2.5 text-[15px] font-medium text-white outline-none placeholder:text-white/70 focus:border-white"
            />
            <button type="button" className="tg-btn bg-tg-ink text-white hover:bg-black">
              Sign up
            </button>
          </form>
        </div>
      </div>
      <div className="tg-container mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-white/30 py-4 text-[13px] font-medium text-white/85">
        <p>© {new Date().getFullYear()} Tágide Festival, Lda. Demo site for Slice.</p>
        <p>Privacy · Terms · Accessibility · Cookies</p>
      </div>
      <div className="tg-container -mb-[0.22em] overflow-hidden" aria-hidden="true">
        <div className="tg-display text-[clamp(96px,19vw,300px)] leading-[0.8] text-white">Tágide</div>
      </div>
    </footer>
  );
}

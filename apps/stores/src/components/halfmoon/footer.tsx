import Link from "next/link";
import { COFFEES, HALFMOON, href } from "@/lib/halfmoon/site";

export function Footer() {
  return (
    <footer className="border-t border-(--hm-line) bg-white">
      <div className="hm-container grid gap-12 pt-16 lg:grid-cols-[1.2fr_1fr_1fr_1fr]">
        <div>
          <p className="hm-title max-w-xs text-[22px]">Small-batch coffee from the California coast, roasted the week it ships.</p>
          <form className="mt-6 max-w-sm" action={href.home}>
            <label htmlFor="hm-news" className="text-[13px] font-medium text-(--hm-ink-soft)">
              Newsletter: new roasts and brew notes, twice a month
            </label>
            <div className="mt-2 flex items-center gap-2 rounded-full bg-[#f3f4f6] p-1.5">
              <input id="hm-news" type="email" name="email" size={1} placeholder="name@email.com" className="h-9 w-full min-w-0 flex-1 bg-transparent pl-3 text-[14.5px] outline-none placeholder:text-(--hm-mute)" />
              <button type="submit" className="hm-btn hm-btn-ink hm-btn-sm h-9">
                Sign up
              </button>
            </div>
          </form>
        </div>
        <div>
          <h2 className="text-[15px] font-semibold">Coffee</h2>
          <ul className="mt-4 space-y-2.5 text-[14.5px] text-(--hm-ink-soft)">
            {COFFEES.map((c) => (
              <li key={c.slug}>
                <Link href={href.coffee(c.slug)} className="hover:text-(--hm-ink)">
                  {c.name}, {c.kind.toLowerCase()}
                </Link>
              </li>
            ))}
            <li>
              <Link href={href.club} className="hover:text-(--hm-ink)">
                Moon Club subscription
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h2 className="text-[15px] font-semibold">Company</h2>
          <ul className="mt-4 space-y-2.5 text-[14.5px] text-(--hm-ink-soft)">
            <li>
              <Link href={href.story} className="hover:text-(--hm-ink)">
                Our story
              </Link>
            </li>
            <li>
              <Link href={href.brew} className="hover:text-(--hm-ink)">
                Brew guides
              </Link>
            </li>
            <li>
              <Link href={href.visit} className="hover:text-(--hm-ink)">
                Visit the roastery
              </Link>
            </li>
            <li>
              <a href={`mailto:${HALFMOON.email}`} className="hover:text-(--hm-ink)">
                Wholesale
              </a>
            </li>
          </ul>
        </div>
        <div>
          <h2 className="text-[15px] font-semibold">Follow</h2>
          <ul className="mt-4 space-y-2.5 text-[14.5px] text-(--hm-ink-soft)">
            {HALFMOON.socials.map((s) => (
              <li key={s.network}>
                <a href={s.url} className="hover:text-(--hm-ink)">
                  {s.network}
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-[14px] leading-relaxed text-(--hm-ink-soft)">
            {HALFMOON.street}, {HALFMOON.city}, {HALFMOON.region} {HALFMOON.postalCode}
          </p>
        </div>
      </div>
      <div className="hm-container pt-14">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/halfmoon/logo.svg" alt="" aria-hidden className="w-full" />
      </div>
      <div className="hm-container flex flex-wrap justify-between gap-2 py-6 text-[12.5px] text-(--hm-mute)">
        <span>© 2026 {HALFMOON.legalName}</span>
        <span>Roasted in {HALFMOON.city}, California</span>
      </div>
    </footer>
  );
}

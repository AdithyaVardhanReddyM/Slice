import Link from "next/link";
import { hotels, href, saltline } from "@/lib/saltline";

export function Footer() {
  return (
    <footer className="mt-28 border-t border-sl-line">
      <div className="sl-container grid gap-12 py-16 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/saltline/logo.svg" alt="Saltline Hotels" width={173} height={32} />
          <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-sl-charcoal-soft">{saltline.store.description}</p>
          <form className="mt-8 max-w-sm">
            <label htmlFor="sl-newsletter" className="text-[15px] font-medium">
              Letters from the hotels
            </label>
            <p className="mt-1 text-sm text-sl-mute">A note from one of the four cities each month. Offers before they are public.</p>
            <div className="mt-3 flex border-b border-sl-charcoal">
              <input
                id="sl-newsletter"
                type="email"
                placeholder="Email address"
                className="min-w-0 flex-1 bg-transparent py-2.5 text-[15px] outline-none placeholder:text-sl-mute"
              />
              <button type="button" className="text-[14px] font-medium tracking-wide hover:text-sl-sea-deep">
                Subscribe
              </button>
            </div>
          </form>
        </div>
        <Col title="Hotels">
          {hotels.map((h) => (
            <Link key={h.slug} href={h.opening ? `${href.hotels}#${h.slug}` : href.hotel(h.slug)}>
              {h.city}
              {h.opening ? " (spring 2027)" : ""}
            </Link>
          ))}
          <Link href={href.locations}>Addresses and directions</Link>
        </Col>
        <Col title="Stay">
          <Link href={href.experiences}>Experiences</Link>
          <Link href={href.offers}>Offers</Link>
          <Link href={href.plan()}>Plan your stay</Link>
          <span>Gift stays</span>
          <span>Private hire and events</span>
        </Col>
        <Col title="Saltline">
          <Link href={href.about}>About</Link>
          <Link href={href.journal}>Journal</Link>
          <span>Careers</span>
          <span>Press</span>
          <span>hello@saltlinehotels.com</span>
        </Col>
      </div>
      <div className="border-t border-sl-line">
        <div className="sl-container flex flex-wrap items-center justify-between gap-3 py-5 text-[13px] text-sl-mute">
          <p>© {new Date().getFullYear()} Saltline Hotels S.A., Rua da Boavista 74, 1200-068 Lisboa. Demo site for Slice.</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            <li>Privacy</li>
            <li>Terms</li>
            <li>Accessibility</li>
          </ul>
        </div>
      </div>
    </footer>
  );
}

function Col({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[15px] font-medium">{title}</p>
      <div className="mt-4 flex flex-col gap-2.5 text-[15px] text-sl-charcoal-soft [&>*]:w-fit [&>a:hover]:text-sl-sea-deep">
        {children}
      </div>
    </div>
  );
}

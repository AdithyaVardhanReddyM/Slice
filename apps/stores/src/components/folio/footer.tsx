import Link from "next/link";
import { FOLIO_SECTIONS, FOLIO_SHOP, address, href } from "@/lib/folio/shop";
import { Logo } from "./logo";

const visitLinks = [
  { label: "What's on", to: href.events },
  { label: "Book club", to: href.bookClub },
  { label: "Saturday Story Hour", to: href.event("story-hour") },
  { label: "Debut Night", to: href.event("debut-night") },
  { label: "The Fern Letter", to: href.newsletter },
];

export function Footer() {
  return (
    <footer className="bg-(--ff-green) text-(--ff-paper)">
      <div className="ff-container grid gap-12 pb-12 pt-16 lg:grid-cols-[1.35fr_1fr_1fr_1.1fr]">
        <div>
          <Logo tone="light" className="h-11" />
          <p className="mt-5 max-w-xs text-[15.5px] leading-relaxed text-(--ff-paper)/80">
            {FOLIO_SHOP.tagline} New books, handwritten staff picks, a reading room in the back and events most weeks, since {FOLIO_SHOP.founded}.
          </p>
          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[15px]" aria-label="Follow us">
            {FOLIO_SHOP.socials.map((s) => (
              <li key={s.network}>
                <a href={s.url} rel="me noopener" target="_blank" className="font-semibold text-(--ff-paper) hover:underline hover:underline-offset-4">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[14px] text-(--ff-paper)/65">{FOLIO_SHOP.socials[0].handle} everywhere</p>
        </div>

        <div>
          <h2 className="text-[14px] font-semibold text-(--ff-paper)/60">Shop</h2>
          <ul className="mt-4 space-y-2 text-[15.5px]">
            <li>
              <Link href={href.newArrivals} className="hover:underline hover:underline-offset-4">
                New arrivals
              </Link>
            </li>
            <li>
              <Link href={href.staffPicks} className="hover:underline hover:underline-offset-4">
                Staff picks
              </Link>
            </li>
            {FOLIO_SECTIONS.slice(0, 5).map((s) => (
              <li key={s.id}>
                <Link href={href.section(s.id)} className="hover:underline hover:underline-offset-4">
                  {s.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-[14px] font-semibold text-(--ff-paper)/60">Events</h2>
          <ul className="mt-4 space-y-2 text-[15.5px]">
            {visitLinks.map((l) => (
              <li key={l.label}>
                <Link href={l.to} className="hover:underline hover:underline-offset-4">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-[14px] font-semibold text-(--ff-paper)/60">Visit</h2>
          <address className="mt-4 text-[15.5px] not-italic leading-relaxed">
            {FOLIO_SHOP.street}
            <br />
            {FOLIO_SHOP.city}, {FOLIO_SHOP.region} {FOLIO_SHOP.postalCode}
            <br />
            <a href={`tel:${FOLIO_SHOP.phone.replace(/[^\d+]/g, "")}`} className="hover:underline hover:underline-offset-4">
              {FOLIO_SHOP.phone}
            </a>
            <br />
            <a href={`mailto:${FOLIO_SHOP.email}`} className="hover:underline hover:underline-offset-4">
              {FOLIO_SHOP.email}
            </a>
          </address>
          <dl className="mt-4 space-y-0.5 text-[15px] text-(--ff-paper)/85">
            {FOLIO_SHOP.hours.map((h) => (
              <div key={h.short} className="flex gap-3">
                <dt className="w-16 shrink-0">{h.short}</dt>
                <dd>{h.label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      <div className="border-t border-(--ff-paper)/15">
        <div className="ff-container flex flex-wrap items-center justify-between gap-3 py-5 text-[13.5px] text-(--ff-paper)/65">
          <p>
            © 2026 {FOLIO_SHOP.legalName}, {address}. Demo site for Slice.
          </p>
          <p>Step-free entrance · Gift wrapping is always free</p>
        </div>
      </div>
    </footer>
  );
}

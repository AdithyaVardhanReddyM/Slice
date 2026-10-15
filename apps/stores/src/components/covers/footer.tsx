import Link from "next/link";
import { COVERS_APP, COVERS_AREAS, COVERS_COLLECTIONS, COVERS_RESTAURANTS, href, officeAddress } from "@/lib/covers/site";
import { Logo } from "./logo";

const company = [
  { label: "All restaurants", to: href.restaurants },
  { label: "Editors' notes", to: href.editors },
  { label: "How Covers works", to: href.how },
  { label: "Get the app", to: href.app },
];

export function Footer() {
  return (
    <footer className="bg-(--cv-ink) text-white">
      <div className="cv-container grid grid-cols-2 gap-x-6 gap-y-12 pb-12 pt-16 lg:grid-cols-[1.5fr_1fr_1.15fr_1fr]">
        <div className="col-span-2 lg:col-span-1">
          <Logo tone="light" className="h-9" />
          <p className="mt-5 max-w-xs text-[15px] leading-relaxed text-white/75">
            {COVERS_APP.tagline} {COVERS_RESTAURANTS.length} restaurants we&apos;d send a friend to, a free table at the time you want, and a note from our editors on what to order.
          </p>
          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[15px]" aria-label="Follow Covers">
            {COVERS_APP.socials.map((s) => (
              <li key={s.network}>
                <a href={s.url} rel="me noopener" target="_blank" className="font-semibold hover:underline hover:underline-offset-4">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[14px] text-white/55">{COVERS_APP.socials[0].handle} everywhere</p>
        </div>

        <FooterList title="Areas" links={COVERS_AREAS.map((a) => ({ label: a.name, to: href.area(a.id) }))} />
        <FooterList title="Collections" links={COVERS_COLLECTIONS.map((c) => ({ label: c.name, to: href.collection(c.id) }))} />

        <div className="col-span-2 sm:col-span-1">
          <FooterList title="Covers" links={company} />
          <address className="mt-6 text-[14.5px] not-italic leading-relaxed text-white/70">
            {COVERS_APP.legalName}
            <br />
            {COVERS_APP.street}
            <br />
            {COVERS_APP.city} {COVERS_APP.postalCode}
            <br />
            <a href={`mailto:${COVERS_APP.email}`} className="text-white hover:underline hover:underline-offset-4">
              {COVERS_APP.email}
            </a>
          </address>
        </div>
      </div>
      <div className="border-t border-white/12">
        <div className="cv-container flex flex-wrap items-center justify-between gap-3 py-5 text-[13.5px] text-white/55">
          <p>
            © 2026 {COVERS_APP.legalName}, {officeAddress}. Demo site for Slice.
          </p>
          <p>Restaurant photos via Qloo. Covers and its editors are fictional.</p>
        </div>
      </div>
    </footer>
  );
}

function FooterList({ title, links }: { title: string; links: { label: string; to: string }[] }) {
  return (
    <div>
      <h2 className="text-[14px] font-semibold text-white/55">{title}</h2>
      <ul className="mt-4 space-y-2 text-[15px]">
        {links.map((l) => (
          <li key={l.label}>
            <Link href={l.to} className="hover:underline hover:underline-offset-4">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

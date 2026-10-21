import Link from "next/link";
import { AREAS, KNOCK, href } from "@/lib/knock/site";

export function Footer() {
  const cols = [
    { title: "Order", links: [{ label: "All restaurants", to: href.restaurants }, ...AREAS.slice(0, 5).map((a) => ({ label: a.name, to: href.area(a.id) }))] },
    { title: "Knock", links: [{ label: "How it works", to: href.how }, { label: "Get the app", to: href.app }, { label: "Careers", to: href.home }, { label: "Press", to: href.home }] },
    { title: "Partners", links: [{ label: "Add your restaurant", to: href.partners }, { label: "Ride with Knock", to: href.partners }, { label: "Knock for offices", to: href.partners }] },
    { title: "Help", links: [{ label: "Support", to: `mailto:${KNOCK.email}` }, { label: "Cold food guarantee", to: href.how }, { label: "Privacy", to: href.home }, { label: "Terms", to: href.home }] },
  ];
  return (
    <footer className="bg-(--kn-ink) text-(--kn-cream)">
      <div className="kn-container grid gap-12 py-16 lg:grid-cols-[1.3fr_2fr]">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/knock/logo-light.svg" alt="Knock" className="h-10 w-auto" />
          <p className="mt-5 max-w-xs text-[15.5px] leading-relaxed text-(--kn-cream)/75">{KNOCK.tagline} {KNOCK.stats.kitchens}+ independent kitchens across Los Angeles, delivered by our own riders.</p>
          <p className="mt-6 text-[14px] text-(--kn-cream)/60">
            {KNOCK.legalName}, {KNOCK.street}, {KNOCK.city}, {KNOCK.region} {KNOCK.postalCode}
          </p>
          <div className="mt-5 flex gap-4 text-[14.5px] font-medium">
            {KNOCK.socials.map((s) => (
              <a key={s.network} href={s.url} className="hover:text-(--kn-yellow)">
                {s.network}
              </a>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-4">
          {cols.map((c) => (
            <div key={c.title}>
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-(--kn-yellow)">{c.title}</h2>
              <ul className="mt-4 space-y-2.5 text-[15px]">
                {c.links.map((l) => (
                  <li key={l.label}>
                    <Link href={l.to} className="text-(--kn-cream)/80 hover:text-white">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-white/10">
        <p className="kn-container py-6 text-[13.5px] text-(--kn-cream)/55">© 2026 {KNOCK.legalName}. Made in Los Angeles.</p>
      </div>
    </footer>
  );
}

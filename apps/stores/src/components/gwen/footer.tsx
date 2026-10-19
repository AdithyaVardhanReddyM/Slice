import Link from "next/link";
import { card, href } from "@/lib/gwen";
import { Wordmark } from "./logo";

const columns = [
  {
    title: "The card",
    links: [
      { label: "Perks", to: href.perks },
      { label: "Rewards", to: href.rewards },
      { label: "Rates and fees", to: href.fees },
      { label: "Check eligibility", to: href.apply },
    ],
  },
  {
    title: "Members",
    links: [
      { label: "Log in", to: "#" },
      { label: "Gwen Travel", to: "#" },
      { label: "Gwen Tables", to: "#" },
      { label: "Gwen Rooms", to: "#" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", to: "#" },
      { label: "Careers", to: "#" },
      { label: "Press", to: "#" },
      { label: "Partners", to: "#" },
    ],
  },
  {
    title: "Help",
    links: [
      { label: "Questions", to: href.faq },
      { label: "Security", to: "#" },
      { label: "Privacy", to: "#" },
      { label: "Accessibility", to: "#" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative overflow-hidden bg-gw-ink text-white">
      <div className="gw-container relative z-10 pt-20">
        <div className="grid gap-12 lg:grid-cols-[1.2fr_2fr]">
          <div>
            <Wordmark tone="light" />
            <p className="mt-5 max-w-xs text-[15px] leading-relaxed text-white/60">
              One card for the table, the trip and the encore. Made in New York.
            </p>
            <div className="mt-6 flex gap-2">
              <a href="#" className="rounded-xl border border-white/15 px-4 py-2.5 text-[13px] font-medium text-white/85 transition-colors hover:bg-white/10">
                App Store
              </a>
              <a href="#" className="rounded-xl border border-white/15 px-4 py-2.5 text-[13px] font-medium text-white/85 transition-colors hover:bg-white/10">
                Google Play
              </a>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {columns.map((c) => (
              <div key={c.title}>
                <h3 className="text-[13px] font-semibold text-white/45">{c.title}</h3>
                <ul className="mt-4 space-y-2.5">
                  {c.links.map((l) => (
                    <li key={l.label}>
                      <Link href={l.to} className="text-[15px] text-white/80 transition-colors hover:text-white">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-16 grid gap-6 border-t border-white/10 pt-8 text-[12.5px] leading-relaxed text-white/45 lg:grid-cols-[2fr_1fr]">
          <p>
            Gwen is a financial technology company, not a bank. {card.name} is issued by {card.issuer}. Approval is subject to credit review. Statement credits are paid up to the stated amount per period and do not roll over. Points
            are worth 1.25 cents each when redeemed for travel booked through Gwen Travel. See rates and fees for current terms.
          </p>
          <p className="lg:text-right">
            {card.address.join(", ")}
            <br />
            {card.phone}
            <br />
            {card.email}
            <br />© 2026 Gwen Financial, Inc.
          </p>
        </div>
      </div>

      {/* The wordmark, cropped by the bottom edge. */}
      <div
        aria-hidden
        className="pointer-events-none relative -mb-[4.5vw] mt-10 select-none text-center font-[family-name:var(--font-gw-display)] text-[30vw] font-semibold leading-[0.8] tracking-[-0.06em]"
        style={{
          background: "linear-gradient(180deg, rgb(255 255 255 / 0.16) 0%, rgb(255 255 255 / 0) 85%)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
        }}
      >
        gwen
      </div>
    </footer>
  );
}

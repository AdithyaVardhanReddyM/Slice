import Link from "next/link";
import { cafes, href, ridgeline } from "@/lib/ridgeline";

export function Footer() {
  return (
    <footer className="mt-24 border-t border-rl-line bg-rl-cream-deep">
      <div className="rl-container grid gap-12 py-16 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ridgeline/logo.svg" alt="Ridgeline Coffee Roasters" width={229} height={40} />
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-rl-ink-soft">{ridgeline.store.description}</p>
          <form className="mt-8 max-w-sm">
            <label htmlFor="rl-newsletter" className="text-[15px] font-semibold">
              Roast notes, twice a month
            </label>
            <p className="mt-1 text-sm text-rl-mute">New coffees, café news and a brew tip. No discounts spam.</p>
            <div className="mt-3 flex overflow-hidden rounded-[4px] border border-rl-ink">
              <input
                id="rl-newsletter"
                type="email"
                placeholder="Email address"
                className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm outline-none placeholder:text-rl-mute"
              />
              <button type="button" className="bg-rl-ink px-5 text-sm font-semibold text-rl-cream hover:bg-rl-rust">
                Sign up
              </button>
            </div>
          </form>
        </div>
        <Col title="Shop">
          <Link href={href.coffee}>All coffee</Link>
          <Link href={href.coffeeSub("Single origins")}>Single origins</Link>
          <Link href={href.coffeeSub("Blends")}>Blends</Link>
          <Link href={href.coffeeSub("Decaf")}>Decaf</Link>
          <Link href={href.coffeeSub("Instant")}>Instant sticks</Link>
          <Link href={href.subscriptions}>Subscriptions</Link>
          <Link href={href.gifts}>Gift sets</Link>
        </Col>
        <Col title="Cafés">
          {cafes.map((c) => (
            <Link key={c.slug} href={`${href.cafes}#${c.slug}`}>
              {c.city}
              {c.opening ? " (opening soon)" : ""}
            </Link>
          ))}
          <Link href={href.locations}>All locations</Link>
          <span>Wholesale</span>
        </Col>
        <Col title="Company">
          <Link href={href.about}>About and sourcing</Link>
          <Link href={href.journal}>Journal</Link>
          <span>Brew guides</span>
          <span>Shipping and returns</span>
          <span>Contact: hello@ridgelinecoffee.com</span>
        </Col>
      </div>
      <div className="border-t border-rl-line">
        <div className="rl-container flex flex-wrap items-center justify-between gap-3 py-5 text-[13px] text-rl-mute">
          <p>© {new Date().getFullYear()} Ridgeline Coffee Roasters LLC, 2211 NE Alberta St, Portland, OR 97211. Demo storefront for Slice.</p>
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
      <p className="text-[15px] font-semibold">{title}</p>
      <div className="mt-4 flex flex-col gap-2.5 text-sm text-rl-ink-soft [&>*]:w-fit [&>a:hover]:text-rl-rust [&>a:hover]:underline">
        {children}
      </div>
    </div>
  );
}

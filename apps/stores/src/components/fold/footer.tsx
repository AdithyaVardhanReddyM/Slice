import Link from "next/link";
import { Package, RotateCcw, Store as StoreIcon, Truck } from "lucide-react";
import type { Store } from "@slice/demo-catalogs";
import { href } from "@/lib/fold";
import { FoldWordmark } from "./wordmark";

const promises = [
  { icon: Truck, title: "Free shipping over $150", body: "Ships from Brooklyn in 1–2 business days." },
  { icon: RotateCcw, title: "Free 30-day returns", body: "Unworn with tags, we send the label." },
  { icon: StoreIcon, title: "24 labels, one checkout", body: "Household names and studios you won't find elsewhere." },
  { icon: Package, title: "Packed without plastic", body: "Recycled boxes and paper tape, every order." },
];

export function Promises() {
  return (
    <ul className="fd-container grid gap-6 py-10 sm:grid-cols-2 lg:grid-cols-4">
      {promises.map(({ icon: Icon, title, body }) => (
        <li key={title} className="flex gap-4">
          <Icon className="mt-0.5 size-6 shrink-0 text-fd-forest" strokeWidth={1.5} />
          <div>
            <p className="text-[15px] font-semibold">{title}</p>
            <p className="mt-0.5 text-sm text-fd-mute">{body}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Footer({ store }: { store: Store }) {
  const brands = store.brands ?? [];
  return (
    <footer className="mt-24">
      <div className="border-t border-fd-line bg-fd-mist">
        <Promises />
      </div>
      <div className="bg-fd-ink text-white">
        <div className="fd-container grid gap-12 py-16 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <FoldWordmark className="text-[30px]" />
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-white/65">{store.description}</p>
            <p className="mt-8 text-[15px] font-semibold">Get new arrivals first</p>
            <form className="mt-3 flex max-w-sm overflow-hidden rounded-full bg-white/10 ring-1 ring-white/15 focus-within:ring-white/60">
              <input
                type="email"
                placeholder="Email address"
                aria-label="Email address"
                className="min-w-0 flex-1 bg-transparent px-5 py-3 text-sm outline-none placeholder:text-white/45"
              />
              <button type="button" className="m-1 rounded-full bg-white px-5 text-sm font-semibold text-fd-ink hover:bg-fd-cream">
                Sign up
              </button>
            </form>
          </div>
          <FooterCol title="Shop">
            <Link href={href.newIn}>New in</Link>
            {store.nav.map((g) => (
              <Link key={g.category} href={href.category(g.category)}>
                {g.label}
              </Link>
            ))}
            <Link href={href.sale}>Sale</Link>
          </FooterCol>
          <FooterCol title="Brands">
            {brands.slice(0, 9).map((b) => (
              <Link key={b.slug} href={href.brand(b.slug)}>
                {b.name}
              </Link>
            ))}
            <Link href={href.brands} className="font-semibold text-white">
              All {brands.length} brands
            </Link>
          </FooterCol>
          <FooterCol title="Help">
            <span>Shipping</span>
            <span>Returns &amp; exchanges</span>
            <span>Size guides</span>
            <span>Track an order</span>
            <span>Contact us</span>
            <Link href={href.edits}>Shop by style</Link>
          </FooterCol>
        </div>
        <div className="border-t border-white/10">
          <div className="fd-container flex flex-wrap items-center justify-between gap-3 py-5 text-[13px] text-white/50">
            <p>© {new Date().getFullYear()} Fold Supply Co., Brooklyn NY. Demo storefront for Slice.</p>
            <p>Privacy · Terms · Accessibility</p>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[15px] font-semibold">{title}</p>
      <div className="mt-4 flex flex-col gap-2.5 text-sm text-white/65 [&>*]:w-fit [&>a:hover]:text-white [&>a:hover]:underline">
        {children}
      </div>
    </div>
  );
}

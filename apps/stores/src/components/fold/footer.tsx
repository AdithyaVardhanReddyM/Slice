import Link from "next/link";
import type { Store } from "@slice/demo-catalogs";
import { href } from "@/lib/fold";

export function Footer({ store }: { store: Store }) {
  const brands = store.brands ?? [];
  return (
    <footer className="mt-40 border-t border-seam">
      <div className="grid gap-12 px-4 py-14 sm:px-8 lg:grid-cols-[1.3fr_1fr_1fr_1fr]">
        <div>
          <p className="didone max-w-sm text-4xl italic leading-[1.05]">
            New labels in your inbox, twice a month.
          </p>
          <form className="mt-8 flex max-w-sm border-b border-bone/30 focus-within:border-signal">
            <input
              type="email"
              placeholder="Email address"
              aria-label="Email"
              className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none placeholder:text-fog"
            />
            <button type="button" className="tag py-2.5 pl-3 text-signal">
              Subscribe
            </button>
          </form>
          <p className="mt-8 max-w-sm text-sm leading-relaxed text-fog">{store.description}</p>
        </div>
        <FooterCol title="Shop">
          {store.nav.map((g) => (
            <Link key={g.category} href={href.category(g.category)}>
              {g.label}
            </Link>
          ))}
        </FooterCol>
        <FooterCol title="The edits">
          {store.styles.map((s) => (
            <Link key={s.id} href={href.edit(s.id)}>
              {s.label}
            </Link>
          ))}
        </FooterCol>
        <FooterCol title="Help">
          <span>Shipping</span>
          <span>Returns &amp; exchanges</span>
          <span>Size guides</span>
          <span>Repairs</span>
          <span>Contact</span>
          <span className="mt-6 text-fog">{brands.length} labels · ships from Brooklyn</span>
        </FooterCol>
      </div>

      {/* The wordmark, folded towards you along a horizontal crease. */}
      <div className="folded-word relative select-none overflow-hidden px-2" aria-hidden>
        <div className="didone creased-text text-center text-[38vw] italic leading-[0.8]" style={{ clipPath: "inset(0 0 50% 0)" }}>
          fold
        </div>
        <div className="lower absolute inset-x-2 top-1/2 -mt-px">
          <div
            className="didone text-center text-[38vw] italic leading-[0.8] text-bone/25"
            style={{ clipPath: "inset(50% 0 0 0)", transform: "translateY(-50%)" }}
          >
            fold
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-seam px-4 py-4 text-fog sm:px-8">
        <p className="tag">© {new Date().getFullYear()} Fold Supply Co. Demo storefront for Slice.</p>
        <p className="tag">Brooklyn · New York</p>
      </div>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="tag text-fog">{title}</p>
      <div className="mt-5 flex flex-col gap-2 text-sm text-bone-2 [&>*]:w-fit [&>a]:underline-grow [&>a:hover]:text-bone">
        {children}
      </div>
    </div>
  );
}

import Link from "next/link";
import type { Store } from "@slice/demo-catalogs";
import { categoryHref, styleHref } from "@/lib/catalog";

export function Footer({ store }: { store: Store }) {
  return (
    <footer className="mt-32 border-t border-ink">
      <div className="rule-grid lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="px-4 py-10 sm:px-6">
          <p className="mono text-mute">Marlow Home Co.</p>
          <p className="mt-4 max-w-sm text-sm leading-relaxed">{store.description}</p>
          <form className="mt-8 flex max-w-sm border-b border-ink">
            <input
              type="email"
              placeholder="Email, for new pieces twice a month"
              className="mono-lg flex-1 bg-transparent py-2 outline-none placeholder:text-mute"
              aria-label="Email"
            />
            <button type="button" className="mono py-2 pl-3 hover:text-cobalt">
              Join →
            </button>
          </form>
        </div>
        <FooterCol title="Shop">
          {store.nav.map((g) => (
            <Link key={g.category} href={categoryHref(g.category)}>
              {g.label}
            </Link>
          ))}
        </FooterCol>
        <FooterCol title="Styles">
          {store.styles.map((s) => (
            <Link key={s.id} href={styleHref(s.id)}>
              {s.label}
            </Link>
          ))}
        </FooterCol>
        <FooterCol title="Help">
          <span>Shipping & returns</span>
          <span>Care guides</span>
          <span>Trade program</span>
          <span>Showrooms</span>
          <span>Contact</span>
        </FooterCol>
      </div>
      <div className="overflow-hidden border-t border-ink">
        <p className="display -mb-[0.1em] whitespace-nowrap text-[22vw] leading-[0.8] tracking-[-0.02em]" aria-hidden>
          Marlow
        </p>
      </div>
      <div className="mono flex flex-wrap items-center justify-between gap-2 border-t border-ink px-4 py-3 text-mute sm:px-6">
        <p>© {new Date().getFullYear()} Marlow Home Co. Demo storefront for Slice.</p>
        <p>Portland · Brooklyn · Austin</p>
      </div>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-10 sm:px-6">
      <p className="mono text-mute">{title}</p>
      <div className="mt-4 flex flex-col gap-2 text-sm [&>*]:w-fit [&>a]:link-rule">{children}</div>
    </div>
  );
}

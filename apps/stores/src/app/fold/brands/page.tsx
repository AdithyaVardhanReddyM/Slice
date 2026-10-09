import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { fold, href } from "@/lib/fold";
import { ProductImage } from "@/components/fold/product-image";

export const metadata = { title: "Brands A–Z" };

export default function BrandsPage() {
  const brands = [...(fold.store.brands ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const letters = Array.from(new Set(brands.map((b) => b.name[0].toUpperCase())));

  return (
    <main className="fd-container pt-6">
      <nav className="flex items-center gap-1 text-sm text-fd-mute" aria-label="Breadcrumb">
        <Link href={href.home} className="hover:text-fd-ink hover:underline">Home</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-fd-ink">Brands</span>
      </nav>
      <header className="mt-6 max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-[-0.02em] sm:text-[40px]">Brands A–Z</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-fd-ink-2">
          {brands.length} brands, from names you already wear to small studios in Lisbon, Seoul, Oslo and Portland.
        </p>
      </header>

      <nav className="sticky top-[var(--fold-header)] z-20 -mx-4 mt-8 border-y border-fd-line bg-white px-4 sm:mx-0 sm:px-0" aria-label="Jump to letter">
        <ul className="no-scrollbar flex gap-1 overflow-x-auto py-2">
          {letters.map((l) => (
            <li key={l}>
              <a href={`#brands-${l}`} className="grid size-9 place-items-center rounded-full text-sm font-semibold hover:bg-fd-mist">
                {l}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {letters.map((l) => (
        <section key={l} id={`brands-${l}`} className="scroll-mt-[calc(var(--fold-header)+4rem)] border-b border-fd-line py-8">
          <h2 className="text-2xl font-semibold">{l}</h2>
          <ul className="mt-5 grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {brands
              .filter((b) => b.name[0].toUpperCase() === l)
              .map((b) => {
                const items = fold.byBrand(b.name);
                return (
                  <li key={b.slug}>
                    <Link href={href.brand(b.slug)} className="group block">
                      <div className="grid grid-cols-3 gap-1 overflow-hidden rounded-md">
                        {items.slice(0, 3).map((p) => (
                          <div key={p.id} className="aspect-[3/4] overflow-hidden bg-fd-mist">
                            <ProductImage product={p} sizes="(min-width: 1024px) 10vw, 30vw" className="transition-transform duration-700 ease-fd group-hover:scale-[1.04]" />
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex items-baseline justify-between gap-3">
                        <p className="text-[17px] font-semibold group-hover:underline">{b.name}</p>
                        <p className="shrink-0 text-sm text-fd-mute">{items.length} items</p>
                      </div>
                      <p className="text-sm text-fd-mute">{b.origin}</p>
                    </Link>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </main>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Product } from "@slice/demo-catalogs";
import { fold, href, navLabel, styleLabel } from "@/lib/fold";
import { AddToCart } from "@/components/fold/add-to-cart";
import { ProductCard } from "@/components/fold/product-card";
import { ProductImage } from "@/components/fold/product-image";

export function generateStaticParams() {
  return fold.products.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/fold/p/[slug]">) {
  const p = fold.get((await params).slug);
  return { title: p ? `${p.brand} ${p.name}` : "Product", description: p?.description };
}

export default async function ProductPage({ params }: PageProps<"/fold/p/[slug]">) {
  const product = fold.get((await params).slug);
  if (!product) notFound();

  const a = product.attributes;
  const brand = fold.store.brands?.find((b) => b.name === product.brand);
  const wearWith = fold.goesWith(product, 4);
  const fromBrand = fold
    .byBrand(product.brand ?? "")
    .filter((p) => p.id !== product.id)
    .slice(0, 4);
  const moreLike = fold.moreLike(product, 4);

  return (
    <main>
      <nav className="tag flex flex-wrap gap-2 px-4 pt-6 text-fog sm:px-8" aria-label="Breadcrumb">
        <Link href={href.home} className="hover:text-bone">Fold</Link>
        <span>/</span>
        <Link href={href.category(product.category)} className="hover:text-bone">{navLabel(product.category)}</Link>
        <span>/</span>
        <Link href={href.subcategory(product.category, product.subcategory)} className="hover:text-bone">
          {product.subcategory}
        </Link>
      </nav>

      <div className="mt-6 grid gap-10 px-4 sm:px-8 lg:grid-cols-[1.25fr_1fr] lg:gap-16">
        <Gallery product={product} />

        <div className="lg:sticky lg:top-[calc(var(--fold-header)+1.5rem)] lg:self-start">
          <div className="flex items-baseline justify-between gap-4">
            {brand ? (
              <Link href={href.brand(brand.slug)} className="tag underline-grow text-bone hover:text-signal">
                {brand.name}
              </Link>
            ) : (
              <span className="tag">{product.brand}</span>
            )}
            {product.rating !== undefined && (
              <span className="text-xs text-fog">
                <span className="text-bone">★ {product.rating.toFixed(1)}</span> · {product.reviewCount ?? 0} reviews
              </span>
            )}
          </div>
          <h1 className="didone fold-rise mt-4 text-5xl leading-[0.95] sm:text-6xl">{product.name}</h1>
          {product.new && <p className="tag mt-4 text-signal">Just in</p>}

          <div className="mt-8">
            <AddToCart product={product} />
          </div>

          <p className="mt-10 text-[15px] leading-relaxed text-bone-2">{product.description}</p>

          <div className="mt-6 flex flex-wrap gap-1.5">
            {a.style.map((s) => (
              <Link
                key={s}
                href={href.edit(s)}
                className="rounded-full border border-seam px-3.5 py-1.5 text-xs text-bone-2 transition-colors hover:border-signal hover:text-signal"
              >
                In the {styleLabel(s).toLowerCase()} edit →
              </Link>
            ))}
          </div>

          <div className="mt-10 border-b border-seam">
            <Fold title="Details & composition" open>
              <ul className="space-y-1.5">
                {product.details.map((d) => (
                  <li key={d} className="flex gap-3">
                    <span className="text-fog">—</span>
                    {d}
                  </li>
                ))}
              </ul>
            </Fold>
            <Fold title="At a glance">
              <dl className="grid grid-cols-[7rem_1fr] gap-y-2">
                <Row label="Colour" value={a.colors.join(", ")} />
                <Row label="Material" value={a.material.join(", ")} />
                {a.fit && <Row label="Fit" value={a.fit} />}
                {a.occasion && <Row label="Wear it for" value={a.occasion.join(", ")} />}
                {a.season && <Row label="Season" value={a.season.join(", ")} />}
                {product.department && <Row label="Department" value={product.department} />}
              </dl>
            </Fold>
            {brand && (
              <Fold title={`About ${brand.name}`}>
                <p className="tag text-fog">{brand.origin}</p>
                <p className="mt-2">{brand.description}</p>
                <Link href={href.brand(brand.slug)} className="tag mt-4 inline-block text-signal underline-grow">
                  Shop {brand.name} →
                </Link>
              </Fold>
            )}
            <Fold title="Shipping & returns">
              Ships from Brooklyn in 1–2 business days. Free shipping over $150 in the US. Free
              returns within 30 days on anything unworn with the tags on.
            </Fold>
          </div>
        </div>
      </div>

      <Rail title={<>wear it <em>with</em></>} products={wearWith} />
      {fromBrand.length > 0 && (
        <Rail
          title={<>more from <em>{product.brand}</em></>}
          products={fromBrand}
          link={brand && { href: href.brand(brand.slug), label: `All ${brand.name}` }}
        />
      )}
      <Rail title={<>more <em>{product.subcategory.toLowerCase()}</em></>} products={moreLike} />
    </main>
  );
}

// One photo per product, so the gallery is the full shot plus two tighter
// crops of it, the way fashion sites show fabric and detail.
function Gallery({ product }: { product: Product }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="dog-ear relative col-span-2 aspect-[3/4]" style={{ "--ear": "44px" } as React.CSSProperties}>
        <div className="sheet absolute inset-0 overflow-hidden bg-night-3">
          <ProductImage product={product} priority sizes="(min-width: 1024px) 55vw, 100vw" />
        </div>
        <span className="flap" aria-hidden />
      </div>
      {product.images.length > 0 &&
        ["30% 35%", "70% 70%"].map((pos) => (
          <div key={pos} className="aspect-square overflow-hidden bg-night-3">
            <ProductImage
              product={product}
              position={pos}
              sizes="(min-width: 1024px) 28vw, 50vw"
              className="scale-[1.8]"
            />
          </div>
        ))}
    </div>
  );
}

function Fold({ title, open, children }: { title: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className="group border-t border-seam">
      <summary className="tag flex cursor-pointer list-none items-center justify-between py-4 [&::-webkit-details-marker]:hidden">
        {title}
        <span className="text-base font-normal transition-transform duration-300 group-open:rotate-45">+</span>
      </summary>
      <div className="pb-6 text-sm leading-relaxed text-bone-2">{children}</div>
    </details>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="tag pt-0.5 text-fog">{label}</dt>
      <dd className="first-letter:uppercase">{value}</dd>
    </>
  );
}

function Rail({
  title,
  products,
  link,
}: {
  title: React.ReactNode;
  products: Product[];
  link?: { href: string; label: string };
}) {
  if (products.length === 0) return null;
  return (
    <section className="mt-28">
      <div className="flex items-end justify-between gap-6 px-4 sm:px-8">
        <h2 className="didone text-5xl sm:text-7xl">{title}</h2>
        {link && (
          <Link href={link.href} className="tag shrink-0 pb-2 text-signal underline-grow">
            {link.label} →
          </Link>
        )}
      </div>
      <ul className="mt-8 grid grid-cols-2 gap-x-3 gap-y-12 px-4 sm:gap-x-5 sm:px-8 lg:grid-cols-4">
        {products.map((p) => (
          <li key={p.id}>
            <ProductCard product={p} sizes="(min-width: 1024px) 25vw, 50vw" />
          </li>
        ))}
      </ul>
    </section>
  );
}

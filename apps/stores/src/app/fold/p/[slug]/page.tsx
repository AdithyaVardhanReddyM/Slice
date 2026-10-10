import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronDown, ChevronRight, Star } from "lucide-react";
import type { Product } from "@slice/demo-catalogs";
import { fold, href, navLabel, styleLabel } from "@/lib/fold";
import { AddToCart } from "@/components/fold/add-to-cart";
import { ProductCard } from "@/components/fold/product-card";
import { ProductImage } from "@/components/fold/product-image";
import { ProductRail, RailItem } from "@/components/fold/product-rail";
import { ProductJsonLd } from "@/components/product-json-ld";

export function generateStaticParams() {
  return fold.products.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/fold/p/[slug]">) {
  const { slug } = await params;
  const p = fold.get(slug);
  return { title: p ? `${p.brand} ${p.name}` : "Product", description: p?.description };
}

export default async function ProductPage({ params }: PageProps<"/fold/p/[slug]">) {
  const { slug } = await params;
  const product = fold.get(slug);
  if (!product) notFound();

  const a = product.attributes;
  const brand = fold.store.brands?.find((b) => b.name === product.brand);
  const fromBrand = fold
    .byBrand(product.brand ?? "")
    .filter((p) => p.id !== product.id)
    .slice(0, 8);

  return (
    <main>
      <ProductJsonLd
        product={product}
        storeName={fold.store.name}
        url={href.product(product.slug)}
        breadcrumbs={[
          { name: "Home", url: href.home },
          { name: navLabel(product.category), url: href.category(product.category) },
          { name: product.subcategory, url: href.subcategory(product.category, product.subcategory) },
        ]}
      />
      <nav className="fd-container flex flex-wrap items-center gap-1 pt-6 text-sm text-fd-mute" aria-label="Breadcrumb">
        <Link href={href.home} className="hover:text-fd-ink hover:underline">Home</Link>
        <ChevronRight className="size-3.5" />
        <Link href={href.category(product.category)} className="hover:text-fd-ink hover:underline">
          {navLabel(product.category)}
        </Link>
        <ChevronRight className="size-3.5" />
        <Link href={href.subcategory(product.category, product.subcategory)} className="hover:text-fd-ink hover:underline">
          {product.subcategory}
        </Link>
      </nav>

      <div className="fd-container mt-6 grid gap-8 lg:grid-cols-[1.25fr_1fr] lg:gap-14 xl:gap-20">
        <Gallery product={product} />

        <div className="lg:sticky lg:top-[calc(var(--fold-header)+1.5rem)] lg:self-start">
          {brand ? (
            <Link href={href.brand(brand.slug)} className="text-[15px] font-semibold underline-offset-4 hover:underline">
              {brand.name}
            </Link>
          ) : (
            <p className="text-[15px] font-semibold">{product.brand}</p>
          )}
          <h1 className="mt-1 text-[26px] font-semibold leading-tight tracking-[-0.02em] sm:text-[30px]">{product.name}</h1>
          {product.rating !== undefined && (
            <div className="mt-2 flex items-center gap-2 text-sm">
              <span className="flex" aria-label={`Rated ${product.rating} out of 5`}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star
                    key={i}
                    className={i <= Math.round(product.rating!) ? "size-4 fill-fd-ink text-fd-ink" : "size-4 text-fd-line"}
                    strokeWidth={1.5}
                  />
                ))}
              </span>
              <span className="text-fd-mute underline">{product.reviewCount ?? 0} reviews</span>
            </div>
          )}

          <div className="mt-6">
            <AddToCart product={product} />
          </div>

          <div className="mt-8 border-b border-fd-line">
            <Section title="Description" open>
              <p>{product.description}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {a.style.map((s) => (
                  <Link
                    key={s}
                    href={href.edit(s)}
                    className="rounded-full bg-fd-mist px-3 py-1.5 text-sm hover:bg-fd-line"
                  >
                    {styleLabel(s)}
                  </Link>
                ))}
              </div>
            </Section>
            <Section title="Details & care">
              <ul className="list-disc space-y-1.5 pl-5">
                {product.details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </Section>
            <Section title="Product information">
              <dl className="grid grid-cols-[8rem_1fr] gap-y-2">
                <Row label="Colour" value={a.colors.join(", ")} />
                <Row label="Material" value={a.material.join(", ")} />
                {a.fit && <Row label="Fit" value={a.fit} />}
                {a.occasion && <Row label="Good for" value={a.occasion.join(", ")} />}
                {a.season && <Row label="Season" value={a.season.join(", ")} />}
                {product.department && <Row label="Department" value={product.department} />}
                <Row label="Product code" value={product.id.toUpperCase()} />
              </dl>
            </Section>
            {brand && (
              <Section title={`About ${brand.name}`}>
                <p className="text-fd-mute">{brand.origin}</p>
                <p className="mt-2">{brand.description}</p>
                <Link href={href.brand(brand.slug)} className="mt-3 inline-block font-semibold underline">
                  Shop all {brand.name}
                </Link>
              </Section>
            )}
            <Section title="Delivery & returns">
              <p>
                Free standard delivery on orders over $150, otherwise $10. Orders ship from Brooklyn in 1–2 business
                days. Free returns within 30 days on anything unworn with the tags attached.
              </p>
            </Section>
          </div>
        </div>
      </div>

      <Rail title="Complete the look" products={fold.goesWith(product, 8)} />
      {fromBrand.length > 0 && (
        <Rail
          title={`More from ${product.brand}`}
          products={fromBrand}
          link={brand && { to: href.brand(brand.slug), label: "View all" }}
        />
      )}
      <Rail title="You may also like" products={fold.moreLike(product, 8)} />
    </main>
  );
}

function Gallery({ product }: { product: Product }) {
  return (
    <div className="lg:sticky lg:top-[calc(var(--fold-header)+1.5rem)] lg:self-start">
      <div className="aspect-[4/5] overflow-hidden bg-fd-mist">
        <ProductImage product={product} priority sizes="(min-width: 1024px) 55vw, 100vw" />
      </div>
    </div>
  );
}

function Section({ title, open, children }: { title: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className="group border-t border-fd-line">
      <summary className="flex cursor-pointer list-none items-center justify-between py-4 text-[15px] font-semibold [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown className="size-5 transition-transform duration-300 group-open:rotate-180" strokeWidth={1.6} />
      </summary>
      <div className="pb-5 text-[15px] leading-relaxed text-fd-ink-2">{children}</div>
    </details>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-fd-mute">{label}</dt>
      <dd className="first-letter:uppercase">{value}</dd>
    </>
  );
}

function Rail({ title, products, link }: { title: string; products: Product[]; link?: { to: string; label: string } }) {
  if (products.length === 0) return null;
  return (
    <section className="mt-20">
      <div className="fd-container mb-6 flex items-end justify-between gap-6">
        <h2 className="text-2xl font-semibold tracking-[-0.02em]">{title}</h2>
        {link && (
          <Link href={link.to} className="shrink-0 text-[15px] font-semibold underline-offset-4 hover:underline">
            {link.label}
          </Link>
        )}
      </div>
      <ProductRail label={title}>
        {products.map((p) => (
          <RailItem key={p.id}>
            <ProductCard product={p} sizes="(min-width: 1024px) 20vw, 46vw" />
          </RailItem>
        ))}
      </ProductRail>
    </section>
  );
}

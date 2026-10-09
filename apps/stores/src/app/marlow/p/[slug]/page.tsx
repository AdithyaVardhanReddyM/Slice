import Link from "next/link";
import { notFound } from "next/navigation";
import { categoryHref, marlow, styleHref, subcategoryHref } from "@/lib/catalog";
import { AddToCart } from "@/components/marlow/add-to-cart";
import { ProductCard, catalogNumber } from "@/components/marlow/product-card";
import { ProductImage } from "@/components/marlow/product-image";
import { GridFill } from "@/components/marlow/grid-fill";

export function generateStaticParams() {
  return marlow.products.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/marlow/p/[slug]">) {
  const { slug } = await params;
  const p = marlow.get(slug);
  return { title: p?.name ?? "Product", description: p?.description };
}

export default async function ProductPage({ params }: PageProps<"/marlow/p/[slug]">) {
  const { slug } = await params;
  const product = marlow.get(slug);
  if (!product) notFound();

  const styles = product.attributes.style
    .map((id) => marlow.store.styles.find((s) => s.id === id))
    .filter((s) => s !== undefined);
  const goesWith = marlow.goesWith(product);
  const moreLike = marlow.moreLike(product);
  const a = product.attributes;

  return (
    <main>
      <nav className="mono flex gap-2 border-b border-ink px-4 py-3 text-mute sm:px-6" aria-label="Breadcrumb">
        <Link href="/marlow" className="hover:text-ink">Marlow</Link>
        <span>/</span>
        <Link href={categoryHref(product.category)} className="hover:text-ink">{product.category}</Link>
        <span>/</span>
        <Link href={subcategoryHref(product.category, product.subcategory)} className="hover:text-ink">
          {product.subcategory}
        </Link>
        <span className="ml-auto text-ink">№ {catalogNumber(product)}</span>
      </nav>

      <div className="grid border-b border-ink lg:grid-cols-[1.2fr_1fr]">
        {/* Main shot, plus a thumbnail row only when the product has more photos. */}
        <div className="rule-grid grid-cols-2 border-b border-ink lg:sticky lg:top-[5.5rem] lg:self-start lg:border-b-0">
          <div className="col-span-2 aspect-[4/5] overflow-hidden lg:aspect-[5/6]">
            <ProductImage product={product} priority sizes="(min-width: 1024px) 55vw, 100vw" />
          </div>
          {product.images.slice(1, 3).map((_, i) => (
            <div key={i} className="aspect-square overflow-hidden">
              <ProductImage product={product} index={i + 1} sizes="30vw" />
            </div>
          ))}
        </div>

        <div className="rise lg:border-l lg:border-ink">
          <div className="px-4 pt-8 sm:px-6">
            <div className="mono flex flex-wrap gap-x-4 gap-y-1 text-mute">
              {styles.map((s) => (
                <Link key={s.id} href={styleHref(s.id)} className="text-cobalt link-rule">
                  {s.label}
                </Link>
              ))}
              {product.rating !== undefined && (
                <span className="ml-auto">
                  ★ {product.rating.toFixed(1)} · {product.reviewCount ?? 0} reviews
                </span>
              )}
            </div>
            <h1 className="display mt-5 text-6xl sm:text-7xl">{product.name}</h1>
            <p className="mt-6 max-w-prose text-[15px] leading-relaxed">{product.description}</p>
          </div>

          <div className="mt-8 border-t border-ink px-4 py-6 sm:px-6">
            <AddToCart product={product} />
          </div>

          <section className="border-t border-ink">
            <h2 className="mono px-4 pt-5 text-mute sm:px-6">Specification</h2>
            <dl className="mt-3 divide-y divide-rule border-t border-rule">
              <Spec label="Material" value={a.material.join(", ")} />
              <Spec label="Colour" value={a.colors.join(", ")} />
              {a.room && <Spec label="Room" value={a.room.join(", ")} />}
              <Spec label="Good for" value={a.useCase.join(", ")} />
              {product.details.map((d, i) => (
                <Spec key={d} label={i === 0 ? "Details" : ""} value={d} />
              ))}
            </dl>
          </section>
        </div>
      </div>

      {goesWith.length > 0 && (
        <section className="border-b border-ink">
          <div className="flex items-end justify-between px-4 pb-4 pt-12 sm:px-6">
            <h2 className="display text-6xl">Goes with</h2>
            {styles[0] && (
              <Link href={styleHref(styles[0].id)} className="mono text-mute link-rule hover:text-ink">
                More {styles[0].label.toLowerCase()} →
              </Link>
            )}
          </div>
          <ul className="rule-grid grid-cols-2 border-t border-rule lg:grid-cols-4">
            {goesWith.map((p) => (
              <li key={p.id}>
                <ProductCard product={p} />
              </li>
            ))}
            <GridFill count={goesWith.length} cols={{ base: 2, lg: 4 }} />
          </ul>
        </section>
      )}

      {moreLike.length > 0 && (
        <section className="border-b border-ink">
          <div className="px-4 pb-4 pt-12 sm:px-6">
            <h2 className="display text-6xl">More {product.subcategory.toLowerCase()}</h2>
          </div>
          <ul className="rule-grid grid-cols-2 border-t border-rule lg:grid-cols-4">
            {moreLike.map((p) => (
              <li key={p.id}>
                <ProductCard product={p} />
              </li>
            ))}
            <GridFill count={moreLike.length} cols={{ base: 2, lg: 4 }} />
          </ul>
        </section>
      )}
    </main>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[6rem_1fr] gap-4 px-4 py-2.5 text-sm sm:px-6">
      <dt className="mono pt-0.5 text-mute">{label}</dt>
      <dd className="capitalize-first">{value}</dd>
    </div>
  );
}

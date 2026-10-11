import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Product } from "@slice/demo-catalogs";
import { href, ridgeline, styleLabel } from "@/lib/ridgeline";
import { ProductJsonLd } from "@/components/product-json-ld";
import { AddToBag } from "./add-to-bag";
import { ProductCard } from "./product-card";
import { ProductImage } from "./product-image";

const SITE = "http://localhost:3002";

const spec = (p: Product, key: string) => p.details.find((d) => d.startsWith(key + ":"))?.slice(key.length + 1).trim();

export function ProductDetail({
  product,
  parent,
  cta,
}: {
  product: Product;
  parent: { name: string; url: string };
  cta?: string;
}) {
  const specKeys = ["Region", "Producer", "Producers", "Components", "Process", "Altitude", "Varieties", "Roast", "Tasting notes", "Grind", "Contents"];
  const specs = specKeys.map((k) => [k, spec(product, k)] as const).filter(([, v]) => v);
  const rest = product.details.filter((d) => !specKeys.some((k) => d.startsWith(k + ":")));
  const related = ridgeline.goesWith(product, 4).filter((p) => p.category !== "Scenes");
  const more = ridgeline.moreLike(product, 4).filter((p) => p.category !== "Scenes");

  return (
    <main>
      <ProductJsonLd
        product={product}
        storeName={ridgeline.store.name}
        url={`${SITE}${href.product(product)}`}
        breadcrumbs={[
          { name: "Home", url: `${SITE}${href.home}` },
          { name: parent.name, url: `${SITE}${parent.url}` },
          { name: product.name, url: `${SITE}${href.product(product)}` },
        ]}
      />
      <nav className="rl-container flex flex-wrap items-center gap-1 pt-6 text-sm text-rl-mute" aria-label="Breadcrumb">
        <Link href={href.home} className="hover:text-rl-ink">Home</Link>
        <ChevronRight className="size-3.5" />
        <Link href={parent.url} className="hover:text-rl-ink">{parent.name}</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-rl-ink">{product.name}</span>
      </nav>

      <div className="rl-container mt-6 grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
        <div className="aspect-[4/5] overflow-hidden rounded-[4px] bg-rl-sand lg:sticky lg:top-[120px] lg:self-start">
          <ProductImage product={product} priority sizes="(min-width: 1024px) 50vw, 100vw" />
        </div>

        <div>
          <p className="text-sm font-medium text-rl-rust">{product.subcategory}</p>
          <h1 className="rl-serif mt-2 text-[36px] sm:text-[44px]">{product.name}</h1>
          {spec(product, "Tasting notes") && (
            <p className="mt-3 text-[17px] font-medium text-rl-ink-soft">{spec(product, "Tasting notes")}</p>
          )}
          {product.rating !== undefined && (
            <p className="mt-3 text-sm text-rl-mute">
              <span className="font-semibold text-rl-ink">{product.rating.toFixed(1)}</span> out of 5 from {product.reviewCount} reviews
            </p>
          )}
          <p className="mt-6 text-[17px] leading-relaxed">{product.description}</p>

          <div className="mt-8">
            <AddToBag product={product} label={cta} />
          </div>
          <p className="mt-3 text-sm text-rl-mute">
            {product.category === "Subscriptions"
              ? "Free shipping. Pause, skip or cancel any time."
              : "Free shipping over $40. Roasted to order and shipped within 48 hours."}
          </p>

          {specs.length > 0 && (
            <dl className="mt-10 grid grid-cols-[9rem_1fr] gap-y-3 border-t border-rl-line pt-6 text-[15px]">
              {specs.map(([k, v]) => (
                <Row key={k} label={k} value={v!} />
              ))}
              <Row label="Profile" value={product.attributes.style.map(styleLabel).join(", ")} />
            </dl>
          )}
          {rest.length > 0 && (
            <div className="mt-8 border-t border-rl-line pt-6">
              <h2 className="text-[15px] font-semibold">{product.category === "Coffee" ? "Brewing and shipping" : "What is included"}</h2>
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[15px] text-rl-ink-soft">
                {rest.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {related.length > 0 && <Rail title="Goes well with" products={related} />}
      {more.length > 0 && <Rail title={`More ${product.subcategory.toLowerCase()}`} products={more} />}
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-rl-mute">{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

function Rail({ title, products }: { title: string; products: Product[] }) {
  return (
    <section className="rl-container mt-20">
      <h2 className="rl-serif text-[28px]">{title}</h2>
      <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-10 lg:grid-cols-4">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} sizes="(min-width: 1024px) 25vw, 50vw" />
        ))}
      </div>
    </section>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { cn } from "cn";
import { fold, href } from "@/lib/fold";
import { ProductGrid } from "@/components/fold/product-grid";

export function generateStaticParams() {
  return fold.store.styles.map((s) => ({ style: s.id }));
}

export async function generateMetadata({ params }: PageProps<"/fold/edit/[style]">) {
  const { style } = await params;
  const s = fold.store.styles.find((x) => x.id === style);
  return { title: s ? `${s.label} style` : "Shop by style" };
}

export default async function StylePage({ params }: PageProps<"/fold/edit/[style]">) {
  const { style } = await params;
  const s = fold.store.styles.find((x) => x.id === style);
  if (!s) notFound();
  const products = fold.withStyle(s.id);
  const categories = fold.store.nav.map((g) => g.category).filter((c) => products.some((p) => p.category === c));

  return (
    <>
      <nav className="border-b border-fd-line" aria-label="Styles">
        <ol className="fd-container no-scrollbar flex gap-6 overflow-x-auto">
          {fold.store.styles.map((x) => (
            <li key={x.id} className="shrink-0">
              <Link
                href={href.edit(x.id)}
                className={cn(
                  "block border-b-2 py-3.5 text-sm font-medium transition-colors",
                  x.id === s.id ? "border-fd-ink" : "border-transparent text-fd-mute hover:text-fd-ink",
                )}
              >
                {x.label}
              </Link>
            </li>
          ))}
        </ol>
      </nav>
      <Suspense>
        <ProductGrid
          products={products}
          store={fold.store}
          crumbs={[{ label: "Home", href: href.home }, { label: "Shop by style", href: href.edits }, { label: s.label }]}
          title={s.label}
          description={s.description}
          subcategories={categories}
          pillField="category"
          facets={["brand", "color", "price"]}
        />
      </Suspense>
    </>
  );
}

import { notFound } from "next/navigation";
import { Suspense } from "react";
import { fold, href } from "@/lib/fold";
import { ProductGrid } from "@/components/fold/product-grid";
import { ProductImage } from "@/components/fold/product-image";

export function generateStaticParams() {
  return (fold.store.brands ?? []).map((b) => ({ brand: b.slug }));
}

export async function generateMetadata({ params }: PageProps<"/fold/brand/[brand]">) {
  const { brand } = await params;
  const b = fold.brand(brand);
  return { title: b?.name ?? "Brand", description: b?.description };
}

export default async function BrandPage({ params }: PageProps<"/fold/brand/[brand]">) {
  const { brand: slug } = await params;
  const brand = fold.brand(slug);
  if (!brand) notFound();
  const products = fold.byBrand(brand.name);
  const categories = fold.store.nav.map((g) => g.category).filter((c) => products.some((p) => p.category === c));
  const covers = products.filter((p) => p.images.length).slice(0, 3);

  return (
    <Suspense>
      <ProductGrid
        products={products}
        store={fold.store}
        crumbs={[{ label: "Home", href: href.home }, { label: "Brands", href: href.brands }, { label: brand.name }]}
        title={brand.name}
        banner={
          <header className="mt-6 grid items-center gap-8 rounded-lg bg-fd-cream p-6 sm:p-10 lg:grid-cols-[1fr_1.1fr]">
            <div>
              <p className="text-sm font-medium text-fd-mute">{brand.origin}</p>
              <h1 className="mt-1 text-4xl font-semibold tracking-[-0.03em] sm:text-[56px] sm:leading-none">{brand.name}</h1>
              <p className="mt-5 max-w-lg text-[16px] leading-relaxed text-fd-ink-2">{brand.description}</p>
              <p className="mt-5 text-sm font-semibold">
                {products.length} pieces across {categories.length} {categories.length === 1 ? "category" : "categories"}
              </p>
            </div>
            <div className="hidden grid-cols-3 gap-2 sm:grid">
              {covers.map((p) => (
                <div key={p.id} className="aspect-[3/4] overflow-hidden rounded-md bg-fd-mist">
                  <ProductImage product={p} sizes="15vw" />
                </div>
              ))}
            </div>
          </header>
        }
        subcategories={categories}
        pillField="category"
        facets={["style", "color", "price"]}
      />
    </Suspense>
  );
}

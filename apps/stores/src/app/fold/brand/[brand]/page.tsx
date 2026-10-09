import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { fold, href } from "@/lib/fold";
import { ProductGrid } from "@/components/fold/product-grid";

export function generateStaticParams() {
  return (fold.store.brands ?? []).map((b) => ({ brand: b.slug }));
}

export async function generateMetadata({ params }: PageProps<"/fold/brand/[brand]">) {
  const b = fold.brand((await params).brand);
  return { title: b?.name ?? "Label", description: b?.description };
}

export default async function BrandPage({ params }: PageProps<"/fold/brand/[brand]">) {
  const brand = fold.brand((await params).brand);
  if (!brand) notFound();
  const products = fold.byBrand(brand.name);
  const categories = Array.from(new Set(products.map((p) => p.category)));

  return (
    <>
      <nav className="tag flex gap-2 px-4 pt-6 text-fog sm:px-8" aria-label="Breadcrumb">
        <Link href={href.brands} className="hover:text-bone">Labels A–Z</Link>
        <span>/</span>
        <span className="text-bone">{brand.name}</span>
      </nav>
      <Suspense>
        <ProductGrid
          products={products}
          store={fold.store}
          subcategories={categories}
          pillField="category"
          kicker={brand.origin}
          title={brand.name}
          description={brand.description}
          facets={["style", "color", "price"]}
        />
      </Suspense>
    </>
  );
}

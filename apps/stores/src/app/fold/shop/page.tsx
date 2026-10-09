import { Suspense } from "react";
import { fold, href, parseDept } from "@/lib/fold";
import { ProductGrid } from "@/components/fold/product-grid";

export async function generateMetadata({ searchParams }: PageProps<"/fold/shop">) {
  const dept = parseDept((await searchParams).dept);
  return { title: dept === "women" ? "Women" : dept === "men" ? "Men" : "Shop all" };
}

export default async function ShopPage({ searchParams }: PageProps<"/fold/shop">) {
  const dept = parseDept((await searchParams).dept);
  const title = dept === "women" ? "Women" : dept === "men" ? "Men" : "Shop all";

  return (
    <Suspense>
      <ProductGrid
        products={fold.products}
        store={fold.store}
        crumbs={[{ label: "Home", href: href.home }, { label: title }]}
        title={title}
        description={
          dept === "women"
            ? "Womenswear and unisex pieces from all 24 brands, from Hedda Vang dresses to Salomon trail runners."
            : dept === "men"
              ? "Menswear and unisex pieces from all 24 brands, from Cranmore oxfords to Carhartt WIP double-knees."
              : "Every piece from every brand we carry."
        }
        subcategories={fold.store.nav.map((g) => g.category)}
        pillField="category"
      />
    </Suspense>
  );
}

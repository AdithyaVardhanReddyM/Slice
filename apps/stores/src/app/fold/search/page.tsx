import { Suspense } from "react";
import { fold, href } from "@/lib/fold";
import { ProductGrid } from "@/components/fold/product-grid";

export const metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: PageProps<"/fold/search">) {
  const { q } = await searchParams;
  const query = (Array.isArray(q) ? q[0] : q)?.trim() ?? "";
  const products = query ? fold.search(query) : [];

  return (
    <Suspense>
      <ProductGrid
        products={products}
        store={fold.store}
        crumbs={[{ label: "Home", href: href.home }, { label: "Search" }]}
        title={query ? `Results for “${query}”` : "Search"}
        description={
          query
            ? `${products.length} ${products.length === 1 ? "item" : "items"} found.`
            : "Search by product, brand, fabric or occasion."
        }
      />
    </Suspense>
  );
}

import { Suspense } from "react";
import { marlow } from "@/lib/catalog";
import { ProductGrid } from "@/components/marlow/product-grid";

export const metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: PageProps<"/marlow/search">) {
  const { q } = await searchParams;
  const query = (Array.isArray(q) ? q[0] : q)?.trim() ?? "";
  const products = query ? marlow.search(query) : [];

  return (
    <Suspense>
      <ProductGrid
        products={products}
        store={marlow.store}
        title={query ? `“${query}”` : "Search"}
        description={
          query
            ? `${products.length} ${products.length === 1 ? "result" : "results"}`
            : "Try a material, a room, or a color."
        }
      />
    </Suspense>
  );
}

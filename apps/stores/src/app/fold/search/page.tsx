import { Suspense } from "react";
import { fold } from "@/lib/fold";
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
        kicker={query ? "Results for" : "Search"}
        title={query ? <em>{query}</em> : "search"}
        description={query ? undefined : "Try a fabric, a label, a mood, or an occasion."}
      />
    </Suspense>
  );
}

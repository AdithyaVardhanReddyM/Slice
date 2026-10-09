import { Suspense } from "react";
import { fold, href } from "@/lib/fold";
import { ProductGrid } from "@/components/fold/product-grid";

export const metadata = { title: "New in" };

export default function NewInPage() {
  // New arrivals first, then the rest of the catalog by newest.
  const fresh = fold.newArrivals();
  return (
    <Suspense>
      <ProductGrid
        products={fresh}
        store={fold.store}
        crumbs={[{ label: "Home", href: href.home }, { label: "New in" }]}
        title="New in"
        description={`${fresh.length} pieces landed this month, from established names and new labels.`}
        subcategories={fold.store.nav.map((g) => g.category).filter((c) => fresh.some((p) => p.category === c))}
        pillField="category"
        initialSort="new"
      />
    </Suspense>
  );
}

import { Suspense } from "react";
import { fold, href } from "@/lib/fold";
import { ProductGrid } from "@/components/fold/product-grid";

export const metadata = { title: "Sale" };

export default function SalePage() {
  const reduced = fold.onSale();
  return (
    <Suspense>
      <ProductGrid
        products={reduced}
        store={fold.store}
        crumbs={[{ label: "Home", href: href.home }, { label: "Sale" }]}
        title="End of season sale"
        description="Final reductions on last season's pieces. While sizes last."
        subcategories={fold.store.nav.map((g) => g.category).filter((c) => reduced.some((p) => p.category === c))}
        pillField="category"
      />
    </Suspense>
  );
}

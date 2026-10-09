import { Suspense } from "react";
import { fold, parseDept } from "@/lib/fold";
import { ProductGrid } from "@/components/fold/product-grid";

export async function generateMetadata({ searchParams }: PageProps<"/fold/shop">) {
  const dept = parseDept((await searchParams).dept);
  return { title: dept ? `Shop ${dept}` : "Shop everything" };
}

export default async function ShopPage({ searchParams }: PageProps<"/fold/shop">) {
  const dept = parseDept((await searchParams).dept);

  return (
    <Suspense>
      <ProductGrid
        products={fold.products}
        store={fold.store}
        kicker={dept ? `${dept} · includes unisex` : "Every label, every rail"}
        title={dept ? <>{dept}<em className="text-signal">.</em></> : <>every<em>thing</em></>}
        description={
          dept === "women"
            ? "Womenswear and everything unisex, from Hedda Vang dresses to Salomon trail runners."
            : dept === "men"
              ? "Menswear and everything unisex, from Cranmore oxfords to Carhartt WIP double-knees."
              : "All twenty-four labels on one rail. Filter by style, label, colour or price."
        }
        // On the all-products page the pills are whole categories.
        subcategories={fold.store.nav.map((g) => g.category)}
        pillField="category"
      />
    </Suspense>
  );
}

import { notFound } from "next/navigation";
import { Suspense } from "react";
import { marlow, slugify } from "@/lib/catalog";
import { ProductGrid } from "@/components/marlow/product-grid";

const blurbs: Record<string, string> = {
  Living: "The room everyone ends up in. Sofas built on kiln-dried frames, tables in solid wood, rugs you can actually clean.",
  Bedroom: "Linen and percale that gets softer, beds that don't creak, light that's low enough to read by.",
  "Kitchen & dining": "Stoneware fired in Portugal, cast iron from Ohio, glass from Vermont. Made to be used every day.",
  Lighting: "The cheapest way to change a room. Floor, table and pendant, all with E26 sockets and dimmable where it counts.",
  Decor: "The small things that make a place yours. Candles, vases, planters, baskets.",
  Workspace: "Desks that don't look like office furniture, and the things that keep them tidy.",
  Outdoor: "Teak, powder-coated aluminum and rope. Built for balconies that get weather.",
};

export function generateStaticParams() {
  return marlow.store.nav.map((g) => ({ category: slugify(g.category) }));
}

export async function generateMetadata({ params }: PageProps<"/marlow/c/[category]">) {
  const { category } = await params;
  const name = marlow.categoryFromSlug(category);
  return { title: name ?? "Shop" };
}

export default async function CategoryPage({ params }: PageProps<"/marlow/c/[category]">) {
  const { category } = await params;
  const name = marlow.categoryFromSlug(category);
  if (!name) notFound();
  const group = marlow.store.nav.find((g) => g.category === name)!;
  const products = marlow.inCategory(name);

  return (
    <Suspense>
      <ProductGrid
        products={products}
        store={marlow.store}
        subcategories={group.subcategories}
        title={group.label}
        description={blurbs[name]}
      />
    </Suspense>
  );
}

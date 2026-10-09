import { notFound } from "next/navigation";
import { Suspense } from "react";
import { fold, slugify } from "@/lib/fold";
import { ProductGrid } from "@/components/fold/product-grid";

const blurbs: Record<string, string> = {
  Tops: "Heavyweight tees, oxford shirts, Lisbon cable knits and hoodies in plant-based dyes.",
  Bottoms: "Selvedge, double-knee canvas, wide pleated wool and a few skirts worth the closet space.",
  Outerwear: "Shells for weather, waxed canvas for work, long coats for the walk home.",
  "Dresses & one-pieces": "Puff sleeves from Oslo, linen from Mallorca, coveralls from Portland.",
  Footwear: "Court classics and trail runners, loafers and lug soles. Sizes in EU.",
  Bags: "Totes, packs and crossbodies that get used daily, from canvas to ripstop to leather.",
  Accessories: "Beanies, caps, sunglasses, silver and the socks people actually notice.",
  "Fragrance & grooming": "Small-batch scent from Montreal, natural skin care and good soap.",
  Lifestyle: "Titanium mugs, notebooks and a few small things for the home.",
};

export function generateStaticParams() {
  return fold.store.nav.map((g) => ({ category: slugify(g.category) }));
}

export async function generateMetadata({ params }: PageProps<"/fold/c/[category]">) {
  const { category } = await params;
  return { title: fold.categoryFromSlug(category) ?? "Shop" };
}

export default async function CategoryPage({ params }: PageProps<"/fold/c/[category]">) {
  const { category } = await params;
  const name = fold.categoryFromSlug(category);
  if (!name) notFound();
  const group = fold.store.nav.find((g) => g.category === name)!;

  return (
    <Suspense>
      <ProductGrid
        products={fold.inCategory(name)}
        store={fold.store}
        subcategories={group.subcategories}
        kicker="Shop"
        title={group.label.toLowerCase()}
        description={blurbs[name]}
      />
    </Suspense>
  );
}

import { notFound } from "next/navigation";
import { Suspense } from "react";
import { fold, href, slugify } from "@/lib/fold";
import { ProductGrid } from "@/components/fold/product-grid";

const blurbs: Record<string, string> = {
  Tops: "Heavyweight tees, oxford shirts, Lisbon cable knits and hoodies in plant-based dyes.",
  Bottoms: "Selvedge denim, double-knee canvas, wide pleated trousers and skirts worth the closet space.",
  Outerwear: "Shells for weather, waxed canvas for work and long wool coats for the walk home.",
  "Dresses & one-pieces": "Puff sleeves from Oslo, linen from Mallorca and coveralls from Portland.",
  Footwear: "Court classics and trail runners, loafers and lug soles. All sizes in EU.",
  Bags: "Totes, packs and crossbodies built for daily use, in canvas, ripstop and leather.",
  Accessories: "Beanies, caps, sunglasses, silver jewellery and the socks people notice.",
  "Fragrance & grooming": "Small-batch fragrance from Montreal, natural skin care and good soap.",
  Lifestyle: "Titanium flasks, notebooks and a few small things for the home.",
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
        crumbs={[{ label: "Home", href: href.home }, { label: group.label }]}
        title={group.label === "Dresses" ? "Dresses & jumpsuits" : group.label === "Grooming" ? "Fragrance & grooming" : group.label}
        description={blurbs[name]}
      />
    </Suspense>
  );
}

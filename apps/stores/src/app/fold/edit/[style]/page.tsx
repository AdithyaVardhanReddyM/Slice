import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { cn } from "cn";
import { fold, href } from "@/lib/fold";
import { ProductGrid } from "@/components/fold/product-grid";

export function generateStaticParams() {
  return fold.store.styles.map((s) => ({ style: s.id }));
}

export async function generateMetadata({ params }: PageProps<"/fold/edit/[style]">) {
  const { style } = await params;
  const s = fold.store.styles.find((x) => x.id === style);
  return { title: s ? `The ${s.label.toLowerCase()} edit` : "The edits" };
}

export default async function EditPage({ params }: PageProps<"/fold/edit/[style]">) {
  const { style } = await params;
  const index = fold.store.styles.findIndex((x) => x.id === style);
  if (index < 0) notFound();
  const s = fold.store.styles[index];
  const products = fold.withStyle(s.id);
  const categories = fold.store.nav.map((g) => g.category).filter((c) => products.some((p) => p.category === c));

  return (
    <>
      <nav className="overflow-x-auto border-b border-seam" aria-label="Edits">
        <ol className="flex w-max gap-1 px-4 py-3 sm:px-8">
          {fold.store.styles.map((x) => (
            <li key={x.id}>
              <Link
                href={href.edit(x.id)}
                className={cn(
                  "block whitespace-nowrap rounded-full px-4 py-1.5 text-sm transition-colors",
                  x.id === s.id ? "bg-signal text-night" : "text-bone-2 hover:text-bone",
                )}
              >
                {x.label}
              </Link>
            </li>
          ))}
        </ol>
      </nav>
      <Suspense>
        <ProductGrid
          products={products}
          store={fold.store}
          subcategories={categories}
          pillField="category"
          kicker={`Edit ${String(index + 1).padStart(2, "0")} of ${fold.store.styles.length}`}
          title={<em>{s.label.toLowerCase()}</em>}
          description={s.description}
          facets={["brand", "color", "price"]}
        />
      </Suspense>
    </>
  );
}

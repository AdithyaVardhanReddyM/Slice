import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { cn } from "cn";
import { marlow, styleHref } from "@/lib/catalog";
import { ProductGrid } from "@/components/marlow/product-grid";

export function generateStaticParams() {
  return marlow.store.styles.map((s) => ({ style: s.id }));
}

export async function generateMetadata({ params }: PageProps<"/marlow/style/[style]">) {
  const { style } = await params;
  const s = marlow.store.styles.find((x) => x.id === style);
  return { title: s ? `${s.label} style` : "Shop by style" };
}

export default async function StylePage({ params }: PageProps<"/marlow/style/[style]">) {
  const { style } = await params;
  const s = marlow.store.styles.find((x) => x.id === style);
  if (!s) notFound();
  const products = marlow.withStyle(s.id);
  const subcategories = Array.from(new Set(products.map((p) => p.subcategory)));

  return (
    <>
      <nav className="border-b border-ink" aria-label="Styles">
        <ol className="flex overflow-x-auto">
          {marlow.store.styles.map((x, i) => (
            <li key={x.id} className="shrink-0">
              <Link
                href={styleHref(x.id)}
                className={cn(
                  "flex items-baseline gap-2 border-r border-rule px-4 py-3 text-sm transition-colors",
                  x.id === s.id ? "bg-cobalt text-chalk" : "hover:bg-stone",
                )}
              >
                <span className={cn("mono", x.id === s.id ? "text-chalk/60" : "text-mute")}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                {x.label}
              </Link>
            </li>
          ))}
        </ol>
      </nav>
      <Suspense>
        <ProductGrid
          products={products}
          store={marlow.store}
          subcategories={subcategories}
          title={s.label}
          description={s.description}
        />
      </Suspense>
    </>
  );
}

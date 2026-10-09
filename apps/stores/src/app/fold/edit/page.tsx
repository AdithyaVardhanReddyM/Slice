import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import { fold, href } from "@/lib/fold";
import { ProductImage } from "@/components/fold/product-image";

export const metadata = { title: "Shop by style" };

export default function StylesPage() {
  const used = new Set<string>();
  return (
    <main className="fd-container pt-6">
      <nav className="flex items-center gap-1 text-sm text-fd-mute" aria-label="Breadcrumb">
        <Link href={href.home} className="hover:text-fd-ink hover:underline">Home</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-fd-ink">Shop by style</span>
      </nav>
      <header className="mt-6 max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-[-0.02em] sm:text-[40px]">Shop by style</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-fd-ink-2">
          Ten ways to dress, each with pieces from across our brands, from tops to shoes to the bag you carry.
        </p>
      </header>
      <ul className="mt-10 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        {fold.store.styles.map((s) => {
          const items = fold.withStyle(s.id);
          const photos = items.filter((p) => p.images.length && !used.has(p.id)).slice(0, 3);
          photos.forEach((p) => used.add(p.id));
          const brands = new Set(items.map((p) => p.brand)).size;
          return (
            <li key={s.id}>
              <Link href={href.edit(s.id)} className="group block">
                <div className="grid aspect-[4/3] grid-cols-[2fr_1fr] grid-rows-2 gap-1 overflow-hidden rounded-md">
                  {photos.map((p, i) => (
                    <div key={p.id} className={i === 0 ? "row-span-2 overflow-hidden bg-fd-mist" : "overflow-hidden bg-fd-mist"}>
                      <ProductImage product={p} sizes="(min-width: 1024px) 22vw, 50vw" className="transition-transform duration-700 ease-fd group-hover:scale-[1.04]" />
                    </div>
                  ))}
                </div>
                <h2 className="mt-4 text-xl font-semibold group-hover:underline">{s.label}</h2>
                <p className="mt-1 text-[15px] leading-relaxed text-fd-ink-2">{s.description}</p>
                <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold">
                  {items.length} pieces from {brands} brands <ArrowRight className="size-4" />
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}

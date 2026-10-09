import { fold } from "@/lib/fold";
import { BrandIndex } from "@/components/fold/brand-index";

export const metadata = { title: "Labels A–Z" };

export default function BrandsPage() {
  const brands = [...(fold.store.brands ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((b) => {
      const items = fold.byBrand(b.name);
      return { ...b, count: items.length, cover: items.find((p) => p.images.length) ?? items[0] };
    });

  return (
    <main className="px-4 sm:px-8">
      <header className="grid gap-8 pb-14 pt-14 lg:grid-cols-[1fr_24rem] lg:items-end lg:pt-20">
        <div>
          <p className="tag text-fog">Labels A–Z</p>
          <h1 className="didone fold-rise mt-4 text-[17vw] leading-[0.86] sm:text-8xl lg:text-[8.5rem]">
            the <em>labels</em>
          </h1>
        </div>
        <p className="text-[15px] leading-relaxed text-bone-2">
          {brands.length} labels from {new Set(brands.map((b) => b.origin.split(", ").pop())).size}{" "}
          countries. Some have been around for a century, some for three seasons. Hover a name to
          see what they make.
        </p>
      </header>
      <BrandIndex brands={brands} />
    </main>
  );
}

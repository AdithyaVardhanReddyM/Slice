import Link from "next/link";
import { Fragment } from "react";
import type { Product } from "@slice/demo-catalogs";
import { fold, href } from "@/lib/fold";
import { BrandIndex } from "@/components/fold/brand-index";
import { Leporello } from "@/components/fold/leporello";
import { ProductCard } from "@/components/fold/product-card";
import { ProductImage } from "@/components/fold/product-image";

// Categories whose photos crop well into tall hero strips, best first.
const heroCategories = ["Outerwear", "Dresses & one-pieces", "Tops", "Bottoms", "Footwear"];
// Hand-picked: these photos hold up as tall hero strips. Three of the five
// are labels that don't exist outside this demo.
const heroPanels = [
  { slug: "seom-halo-cropped-puffer", style: "streetwear" },
  { slug: "hedda-vang-froya-quilted-floral-jacket", style: "romantic-boho" },
  { slug: "snow-peak-light-mountain-cloth-parka", style: "gorpcore-outdoor" },
  { slug: "studio-nicholson-hayle-oversized-wool-coat", style: "quiet-minimal" },
  { slug: "asche-kohle-long-leather-coat", style: "dark-gothic" },
];

// One product per style, no repeats, preferring photographed apparel.
function pickFor(styles: string[], used = new Set<string>()): { product: Product; style: string }[] {
  return styles.flatMap((style) => {
    const ranked = fold
      .withStyle(style)
      .filter((p) => !used.has(p.id))
      .sort(
        (a, b) =>
          Number(b.images.length > 0) - Number(a.images.length > 0) ||
          rank(a.category) - rank(b.category) ||
          Number(b.bestseller ?? false) - Number(a.bestseller ?? false),
      );
    const product = ranked[0];
    if (!product) return [];
    used.add(product.id);
    return [{ product, style }];
  });
}
const rank = (c: string) => (heroCategories.indexOf(c) + 1 || 99);

// Asymmetric edit grid: column spans on a 6-col grid, row by row.
const editSpans = [4, 2, 2, 2, 2, 2, 4, 2, 2, 2];
const spanClass: Record<number, string> = { 2: "lg:col-span-2", 4: "lg:col-span-4" };

export default function FoldHome() {
  const { store } = fold;
  const hero = heroPanels.flatMap(({ slug, style }) => {
    const product = fold.get(slug);
    return product ? [{ product, style }] : [];
  });
  const used = new Set(hero.map((h) => h.product.id));
  const editCovers = new Map(pickFor(store.styles.map((s) => s.id), used).map((x) => [x.style, x.product]));
  const justIn = fold.newArrivals().slice(0, 10);
  const loved = fold.bestsellers().slice(0, 8);
  const brands = (store.brands ?? []).map((b) => {
    const items = fold.byBrand(b.name);
    return { ...b, count: items.length, cover: items.find((p) => p.images.length) ?? items[0] };
  });

  return (
    <main>
      {/* Hero */}
      <section className="pt-10 lg:pt-14">
        <div className="grid gap-8 px-4 sm:px-8 lg:grid-cols-[1fr_22rem] lg:items-end">
          <div>
            <p className="tag text-fog">Autumn / Winter 2026 · {store.brands?.length} labels · {fold.products.length} pieces</p>
            <h1 className="didone fold-rise mt-5 text-[15.5vw] leading-[0.84] lg:text-[10.5vw]">
              known names,
              <br />
              <em className="text-signal">new names.</em>
            </h1>
          </div>
          <div className="pb-2">
            <p className="text-[15px] leading-relaxed text-bone-2">
              Nike next to a knitwear mill outside Lisbon. Salomon next to a canvas workshop in
              Portland. We hang them on the same rail, so you shop by what something is, not
              whose name is on it.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href={href.shop("women")} className="tag rounded-full bg-bone px-6 py-3.5 text-night transition-colors hover:bg-signal">
                Shop women
              </Link>
              <Link href={href.shop("men")} className="tag rounded-full border border-bone/40 px-6 py-3.5 transition-colors hover:border-signal hover:text-signal">
                Shop men
              </Link>
            </div>
          </div>
        </div>
        <div className="mt-8 px-4 sm:px-8">
          <Leporello panels={hero} />
          <div className="mt-1 flex justify-between text-fog">
            <p className="tag">Fig. 1 — Five edits on one strip</p>
            <p className="tag hidden sm:block">Hover to unfold</p>
          </div>
        </div>
      </section>

      {/* Just in: a horizontal rail */}
      <section className="mt-28">
        <SectionHead kicker="New this week" title={<>just <em>in</em></>} link={{ href: href.shop(), label: "Shop everything" }} />
        <ul className="mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:gap-5 sm:px-8 [scrollbar-width:thin]">
          {justIn.map((p) => (
            <li key={p.id} className="w-[62vw] shrink-0 snap-start sm:w-[34vw] lg:w-[22vw]">
              <ProductCard product={p} sizes="(min-width: 1024px) 22vw, 60vw" />
            </li>
          ))}
        </ul>
      </section>

      {/* The labels */}
      <section className="mt-32 grid gap-12 px-4 sm:px-8 lg:grid-cols-[minmax(0,26rem)_1fr]">
        <div className="lg:sticky lg:top-[calc(var(--fold-header)+2rem)] lg:self-start">
          <p className="tag text-fog">Labels A–Z</p>
          <h2 className="didone mt-4 text-6xl leading-[0.9] sm:text-7xl">
            twenty-four labels. <em className="text-bone-2">some you know.</em>
          </h2>
          <p className="mt-6 max-w-sm text-[15px] leading-relaxed text-bone-2">
            Household names, cult Japanese and Scandinavian makers, and small studios we found
            before anyone else did. Same rail, same standards.
          </p>
          <Link href={href.brands} className="tag mt-8 inline-block text-signal underline-grow">
            All labels →
          </Link>
        </div>
        <BrandIndex brands={brands} size="md" />
      </section>

      {/* The edits */}
      <section className="mt-32">
        <SectionHead kicker="Ten ways to dress" title={<>the <em>edits</em></>} link={{ href: href.edits, label: "All edits" }} />
        <ul className="mt-10 grid gap-4 px-4 sm:grid-cols-2 sm:px-8 lg:grid-cols-6 lg:gap-5">
          {store.styles.map((s, i) => {
            const cover = editCovers.get(s.id);
            const wide = editSpans[i] === 4;
            return (
              <li key={s.id} className={spanClass[editSpans[i]]}>
                <Link href={href.edit(s.id)} className="group relative block overflow-hidden bg-night-3">
                  <div className={wide ? "aspect-[4/5] sm:aspect-[16/11]" : "aspect-[4/5]"}>
                    {cover && (
                      <ProductImage
                        product={cover}
                        sizes={wide ? "(min-width: 1024px) 66vw, 100vw" : "(min-width: 1024px) 33vw, 50vw"}
                        className="transition-transform duration-[1200ms] ease-fold group-hover:scale-[1.04]"
                      />
                    )}
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
                    <p className="tag text-bone/70">
                      Edit {String(i + 1).padStart(2, "0")} · {fold.withStyle(s.id).length} pieces
                    </p>
                    <h3 className={`didone mt-2 italic transition-colors group-hover:text-signal ${wide ? "text-6xl sm:text-7xl" : "text-5xl"}`}>
                      {s.label.toLowerCase()}
                    </h3>
                    <p className="mt-3 max-w-md text-sm leading-relaxed text-bone-2 opacity-0 transition-opacity duration-500 group-hover:opacity-100 max-lg:opacity-100">
                      {s.description}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Inverted band: how we buy */}
      <section className="mt-32 bg-bone text-night">
        <div className="grid gap-12 px-4 py-20 sm:px-8 lg:grid-cols-[1fr_1.4fr]">
          <h2 className="didone text-6xl leading-[0.9] sm:text-8xl">
            shop by what it <em>is.</em>
          </h2>
          <ol className="grid gap-10 sm:grid-cols-3">
            {[
              ["Same rail", "A $30 tee from a Seoul studio hangs next to a $40 tee from Nike. Filters work by fabric, fit and mood before they work by name."],
              ["Small runs", "Eight of our labels make fewer than five thousand pieces a season. When a size is gone, it's gone."],
              ["Worn first", "Everything is worn by someone on our team for a week before we buy it. If it pills, shrinks or fades badly, we pass."],
            ].map(([title, body], i) => (
              <li key={title}>
                <p className="didone text-5xl italic text-night/30">{i + 1}</p>
                <h3 className="tag mt-4">{title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-night/75">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Category poster */}
      <section className="mt-32 px-4 sm:px-8">
        <p className="tag text-fog">Departments</p>
        <p className="didone mt-6 text-[11vw] leading-[0.95] sm:text-[7.5vw]">
          {store.nav.map((g, i) => (
            <Fragment key={g.category}>
              <span className="whitespace-nowrap">
                <Link href={href.category(g.category)} className="transition-colors hover:italic hover:text-signal">
                  {g.label.toLowerCase()}
                </Link>
                {i < store.nav.length - 1 && <span className="ml-[0.15em] text-seam">/</span>}
              </span>{" "}
            </Fragment>
          ))}
        </p>
      </section>

      {/* Most loved */}
      <section className="mt-32">
        <SectionHead kicker="Reordered most" title={<>most <em>loved</em></>} />
        <ul className="mt-10 grid grid-cols-2 gap-x-3 gap-y-12 px-4 sm:gap-x-5 sm:px-8 lg:grid-cols-4">
          {loved.map((p) => (
            <li key={p.id}>
              <ProductCard product={p} sizes="(min-width: 1024px) 25vw, 50vw" />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function SectionHead({
  kicker,
  title,
  link,
}: {
  kicker: string;
  title: React.ReactNode;
  link?: { href: string; label: string };
}) {
  return (
    <div className="flex items-end justify-between gap-6 px-4 sm:px-8">
      <div>
        <p className="tag text-fog">{kicker}</p>
        <h2 className="didone mt-3 text-6xl sm:text-8xl">{title}</h2>
      </div>
      {link && (
        <Link href={link.href} className="tag shrink-0 pb-3 text-signal underline-grow">
          {link.label} →
        </Link>
      )}
    </div>
  );
}

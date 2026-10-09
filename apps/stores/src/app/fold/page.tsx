import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Product } from "@slice/demo-catalogs";
import { fold, href } from "@/lib/fold";
import { ProductCard } from "@/components/fold/product-card";
import { ProductImage } from "@/components/fold/product-image";
import { ProductRail, RailItem } from "@/components/fold/product-rail";

// Hand-picked photos that hold up at large crops.
const pick = (slug: string) => fold.get(slug) ?? fold.products[0];

const categoryCovers: Record<string, string> = {
  Tops: "malha-lisboa-alfama-fisherman-cable-sweater",
  Bottoms: "studio-nicholson-sorte-pleated-wide-trousers-linen",
  Outerwear: "snow-peak-light-mountain-cloth-parka",
  "Dresses & one-pieces": "hedda-vang-astrid-puff-sleeve-poplin-dress",
  Footwear: "dr-martens-1460-smooth-leather-boot",
  Bags: "burnside-canvas-belmont-waxed-canvas-rucksack",
  Accessories: "arket-acetate-d-frame-sunglasses",
  "Fragrance & grooming": "hedda-vang-rosehage-eau-de-parfum",
  Lifestyle: "snow-peak-titanium-flask-m",
};

// Where the first photo match doesn't read as the style at card size.
const styleCoverOverrides: Record<string, string> = {
  streetwear: "seom-static-oversized-tee",
};

const SPOTLIGHT = "Malha Lisboa";

export default function FoldHome() {
  const { store } = fold;
  const women = pick("studio-nicholson-hayle-oversized-wool-coat");
  const men = pick("norse-projects-tycho-wool-car-coat");
  const newIn = fold.newArrivals();
  const bestsellers = fold.bestsellers();
  const spotlight = store.brands?.find((b) => b.name === SPOTLIGHT);
  const spotlightProducts = fold.byBrand(SPOTLIGHT).slice(0, 3);
  const used = new Set(Object.values(styleCoverOverrides).map((slug) => fold.get(slug)?.id));
  const styleCovers = store.styles.map((s) => {
    const override = styleCoverOverrides[s.id];
    const ranked = fold
      .withStyle(s.id)
      .filter((p) => p.images.length && !used.has(p.id))
      .sort((a, b) => rank(a) - rank(b));
    const cover = (override ? fold.get(override) : undefined) ?? ranked[0] ?? fold.withStyle(s.id)[0];
    used.add(cover.id);
    return { style: s, cover, count: fold.withStyle(s.id).length };
  });
  const saleCount = fold.onSale().length;

  return (
    <main>
      {/* Hero: women / men */}
      <section className="grid gap-px bg-fd-line md:grid-cols-2">
        <HeroTile product={women} eyebrow="New season" title="Women" cta="Shop women" to={href.shop("women")} priority />
        <HeroTile product={men} eyebrow="New season" title="Men" cta="Shop men" to={href.shop("men")} priority />
      </section>

      {/* Intro */}
      <section className="fd-container py-14 text-center sm:py-20">
        <h1 className="mx-auto max-w-3xl text-[28px] font-semibold leading-tight tracking-[-0.02em] sm:text-[40px]">
          Known names next to new ones. {store.brands?.length} brands, one checkout.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-[16px] leading-relaxed text-fd-ink-2">
          Nike and Levi&apos;s hang next to a knitwear mill outside Lisbon and a canvas workshop in Portland. Shop by
          what something is, not whose name is on it.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href={href.newIn} className="rounded-full bg-fd-ink px-7 py-3.5 text-[15px] font-semibold text-white hover:bg-fd-forest">
            Shop new in
          </Link>
          <Link href={href.brands} className="rounded-full border border-fd-ink px-7 py-3.5 text-[15px] font-semibold hover:bg-fd-ink hover:text-white">
            Browse brands
          </Link>
        </div>
      </section>

      {/* Categories */}
      <section>
        <SectionHead title="Shop by category" />
        <ProductRail label="Categories">
          {store.nav.map((g) => {
            const cover = pick(categoryCovers[g.category]);
            return (
              <li key={g.category} className="w-[40vw] shrink-0 snap-start sm:w-[24vw] lg:w-[calc((100%-6*1.5rem)/7)]">
                <Link href={href.category(g.category)} className="group block">
                  <div className="aspect-[4/5] overflow-hidden rounded-md bg-fd-mist">
                    <ProductImage product={cover} sizes="(min-width: 1024px) 14vw, 40vw" className="transition-transform duration-700 ease-fd group-hover:scale-[1.04]" />
                  </div>
                  <p className="mt-3 text-[15px] font-semibold group-hover:underline">{g.label}</p>
                  <p className="text-sm text-fd-mute">{fold.inCategory(g.category).length} items</p>
                </Link>
              </li>
            );
          })}
        </ProductRail>
      </section>

      {/* New in */}
      <section className="mt-20">
        <SectionHead title="New in" link={{ to: href.newIn, label: "View all" }} />
        <ProductRail label="New in">
          {newIn.map((p) => (
            <RailItem key={p.id}>
              <ProductCard product={p} sizes="(min-width: 1024px) 20vw, 46vw" />
            </RailItem>
          ))}
        </ProductRail>
      </section>

      {/* Brand spotlight */}
      {spotlight && (
        <section className="mt-20 bg-fd-cream">
          <div className="fd-container grid items-center gap-10 py-14 lg:grid-cols-[1fr_1.2fr] lg:gap-16 lg:py-20">
            <Link href={href.brand(spotlight.slug)} className="group block overflow-hidden rounded-md">
              <div className="aspect-[4/5] bg-fd-mist">
                <ProductImage
                  product={pick("malha-lisboa-alfama-crochet-trim-cardigan-coat")}
                  sizes="(min-width: 1024px) 40vw, 100vw"
                  className="transition-transform duration-1000 ease-fd group-hover:scale-[1.03]"
                />
              </div>
            </Link>
            <div>
              <p className="text-sm font-semibold text-fd-forest">Brand spotlight</p>
              <h2 className="mt-2 text-[34px] font-semibold leading-tight tracking-[-0.02em] sm:text-5xl">{spotlight.name}</h2>
              <p className="mt-1 text-[15px] text-fd-mute">{spotlight.origin}</p>
              <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-fd-ink-2">{spotlight.description}</p>
              <Link
                href={href.brand(spotlight.slug)}
                className="mt-7 inline-flex items-center gap-2 rounded-full bg-fd-ink px-6 py-3 text-[15px] font-semibold text-white hover:bg-fd-forest"
              >
                Shop {spotlight.name} <ArrowRight className="size-4" />
              </Link>
              <ul className="mt-10 grid grid-cols-3 gap-4">
                {spotlightProducts.map((p) => (
                  <li key={p.id}>
                    <ProductCard product={p} sizes="(min-width: 1024px) 15vw, 30vw" />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* Shop by style */}
      <section className="mt-20">
        <SectionHead
          title="Shop by style"
          subtitle="Ten looks, each with pieces from across our brands."
          link={{ to: href.edits, label: "All styles" }}
        />
        <ProductRail label="Styles">
          {styleCovers.map(({ style, cover, count }) => (
            <li key={style.id} className="w-[64vw] shrink-0 snap-start sm:w-[38vw] lg:w-[calc((100%-3*1.5rem)/4)]">
              <Link href={href.edit(style.id)} className="group relative block overflow-hidden rounded-md">
                <div className="aspect-[4/5] bg-fd-mist">
                  <ProductImage product={cover} sizes="(min-width: 1024px) 25vw, 60vw" className="transition-transform duration-700 ease-fd group-hover:scale-[1.04]" />
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/0" />
                <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                  <p className="text-xl font-semibold">{style.label}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-white/80">{style.description}</p>
                  <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold">
                    Shop {count} pieces <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ProductRail>
      </section>

      {/* Bestsellers */}
      <section className="mt-20">
        <SectionHead title="Bestsellers" subtitle="What our customers reorder most." />
        <ProductRail label="Bestsellers">
          {bestsellers.map((p) => (
            <RailItem key={p.id}>
              <ProductCard product={p} sizes="(min-width: 1024px) 20vw, 46vw" />
            </RailItem>
          ))}
        </ProductRail>
      </section>

      {/* Promo banners */}
      <section className="fd-container mt-20 grid gap-4 md:grid-cols-2 lg:gap-6">
        <PromoTile
          product={pick("soller-formentor-linen-maxi-dress")}
          eyebrow={`${saleCount} pieces reduced`}
          title="End of season sale"
          cta="Shop the sale"
          to={href.sale}
        />
        <PromoTile
          product={pick("seom-halo-cropped-puffer")}
          eyebrow="New to Fold"
          title="SEOM, from Seoul"
          cta="Shop SEOM"
          to={href.brand("seom")}
        />
      </section>

      {/* Brands */}
      <section className="mt-20">
        <SectionHead title="Our brands" link={{ to: href.brands, label: "Brands A–Z" }} />
        <ul className="fd-container grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[...(store.brands ?? [])]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((b) => (
              <li key={b.slug}>
                <Link
                  href={href.brand(b.slug)}
                  className="flex h-full flex-col justify-between rounded-md border border-fd-line px-4 py-4 transition-colors hover:border-fd-ink hover:bg-fd-mist"
                >
                  <span className="text-[17px] font-semibold tracking-[-0.01em]">{b.name}</span>
                  <span className="mt-3 text-xs text-fd-mute">{b.origin.split(",")[0]}</span>
                </Link>
              </li>
            ))}
        </ul>
      </section>
    </main>
  );
}

const rankOrder = ["Outerwear", "Dresses & one-pieces", "Tops", "Bottoms", "Footwear"];
const rank = (p: Product) => (rankOrder.indexOf(p.category) + 1 || 99) - (p.bestseller ? 0.5 : 0);

function HeroTile({
  product,
  eyebrow,
  title,
  cta,
  to,
  priority,
}: {
  product: Product;
  eyebrow: string;
  title: string;
  cta: string;
  to: string;
  priority?: boolean;
}) {
  return (
    <Link href={to} className="group relative block h-[68vh] min-h-[460px] overflow-hidden bg-fd-mist md:h-[82vh]">
      <ProductImage product={product} priority={priority} sizes="(min-width: 768px) 50vw, 100vw" className="transition-transform duration-[1400ms] ease-fd group-hover:scale-[1.03]" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/5 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-10">
        <p className="text-[15px] font-medium text-white/85">{eyebrow}</p>
        <h2 className="mt-1 text-5xl font-semibold tracking-[-0.03em] sm:text-6xl">{title}</h2>
        <span className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-[15px] font-semibold text-fd-ink transition-colors group-hover:bg-fd-cream">
          {cta} <ArrowRight className="size-4" />
        </span>
      </div>
    </Link>
  );
}

function PromoTile({
  product,
  eyebrow,
  title,
  cta,
  to,
}: {
  product: Product;
  eyebrow: string;
  title: string;
  cta: string;
  to: string;
}) {
  return (
    <Link href={to} className="group relative block aspect-[4/3] overflow-hidden rounded-md bg-fd-mist sm:aspect-[16/11]">
      <ProductImage product={product} sizes="(min-width: 768px) 50vw, 100vw" className="transition-transform duration-1000 ease-fd group-hover:scale-[1.03]" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/0 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-8">
        <p className="text-sm font-medium text-white/85">{eyebrow}</p>
        <h3 className="mt-1 text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">{title}</h3>
        <span className="mt-4 inline-flex items-center gap-1.5 text-[15px] font-semibold underline-offset-4 group-hover:underline">
          {cta} <ArrowRight className="size-4" />
        </span>
      </div>
    </Link>
  );
}

function SectionHead({ title, subtitle, link }: { title: string; subtitle?: string; link?: { to: string; label: string } }) {
  return (
    <div className="fd-container mb-6 flex items-end justify-between gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-[-0.02em] sm:text-[28px]">{title}</h2>
        {subtitle && <p className="mt-1 text-[15px] text-fd-mute">{subtitle}</p>}
      </div>
      {link && (
        <Link href={link.to} className="flex shrink-0 items-center gap-1 text-[15px] font-semibold underline-offset-4 hover:underline">
          {link.label} <ArrowRight className="size-4" />
        </Link>
      )}
    </div>
  );
}

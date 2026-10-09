import Link from "next/link";
import { categoryHref, marlow, styleHref } from "@/lib/catalog";
import { ProductCard, catalogNumber } from "@/components/marlow/product-card";
import { ProductImage } from "@/components/marlow/product-image";
import { GridFill } from "@/components/marlow/grid-fill";

export default function MarlowHome() {
  const { store } = marlow;
  const bestsellers = marlow.bestsellers().slice(0, 8);
  const newArrivals = marlow.newArrivals().slice(0, 6);
  // Hand-picked: these photos hold up at hero crop sizes.
  const hero = marlow.get("orla-boucle-armchair") ?? marlow.products[0];
  const heroB = marlow.get("foundry-leather-armchair") ?? marlow.products[1];
  const heroC = marlow.get("atlas-reactive-glaze-mug-set-of-4") ?? marlow.products[2];

  return (
    <main>
      {/* Hero: the headline is the hero. */}
      <section className="border-b border-ink">
        <div className="px-4 pt-10 sm:px-6 lg:pt-14">
          <div className="rise flex flex-wrap items-end justify-between gap-4">
            <p className="mono text-mute">Autumn / Winter 2026 — Catalog № 07</p>
            <p className="mono text-mute">{marlow.products.length} pieces · 7 rooms · 22 workshops</p>
          </div>
          <h1 className="display rise rise-delay-1 mt-6 text-[19vw] leading-[0.84] sm:text-[15vw] lg:text-[12.5vw]">
            Furniture
            <br />
            for the <span className="text-cobalt">long run</span>
          </h1>
        </div>
        <div className="rule-grid rise rise-delay-3 mt-10 border-t border-ink lg:grid-cols-[2fr_1fr_1fr]">
          <Link href={`/marlow/p/${hero.slug}`} className="group relative aspect-[16/10] lg:aspect-auto">
            <ProductImage
              product={hero}
              priority
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="transition-transform duration-[1200ms] ease-out-soft group-hover:scale-[1.02]"
            />
            <HeroCaption product={hero} />
          </Link>
          <Link href={`/marlow/p/${heroB.slug}`} className="group relative aspect-[4/5]">
            <ProductImage product={heroB} sizes="(min-width: 1024px) 25vw, 50vw" className="transition-transform duration-[1200ms] ease-out-soft group-hover:scale-[1.02]" />
            <HeroCaption product={heroB} />
          </Link>
          <div className="grid grid-rows-[auto_1fr]">
            <Link href={`/marlow/p/${heroC.slug}`} className="group relative aspect-[4/3] overflow-hidden">
              <ProductImage product={heroC} sizes="(min-width: 1024px) 25vw, 50vw" className="transition-transform duration-[1200ms] ease-out-soft group-hover:scale-[1.02]" />
              <HeroCaption product={heroC} />
            </Link>
            <div className="border-t border-rule p-5">
              <p className="display-wide text-2xl">
                Solid wood, hand-glazed stoneware, woven textiles.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-mute">
                Designed in Portland, made by workshops we name on every product. Free
                shipping over $75 and 100 days to decide.
              </p>
              <Link href={categoryHref("Living")} className="mono mt-5 inline-block bg-ink px-4 py-2.5 text-chalk hover:bg-cobalt">
                Shop living →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Rooms index */}
      <section className="border-b border-ink">
        <SectionHead index="01" title="By room" aside={`${store.nav.length} departments`} />
        <ol className="rule-grid border-t border-rule sm:grid-cols-2 lg:grid-cols-4">
          {store.nav.map((g, i) => {
            const items = marlow.inCategory(g.category);
            const sample = items[(i * 3) % items.length];
            return (
              <li key={g.category}>
                <Link href={categoryHref(g.category)} className="group flex h-full flex-col">
                  <div className="flex items-baseline justify-between px-4 pt-4">
                    <span className="mono text-mute">{String(i + 1).padStart(2, "0")}</span>
                    <span className="mono text-mute">{items.length} pcs</span>
                  </div>
                  <h3 className="display px-4 pb-4 pt-2 text-5xl group-hover:text-cobalt transition-colors">
                    {g.label}
                  </h3>
                  <div className="mt-auto aspect-[5/3] overflow-hidden border-t border-rule bg-stone">
                    {sample && (
                      <ProductImage
                        product={sample}
                        sizes="(min-width: 1024px) 25vw, 50vw"
                        className="transition-transform duration-700 ease-out-soft group-hover:scale-[1.04]"
                      />
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
          {/* Fill the last cell of a 4-col row with the styles call-out. */}
          <li className="bg-cobalt! text-chalk">
            <Link href={styleHref("japandi")} className="flex h-full flex-col justify-between p-4">
              <span className="mono">Not sure where to start</span>
              <span className="display mt-10 text-5xl">
                Shop by
                <br />
                style ↗
              </span>
              <span className="mt-6 text-sm leading-relaxed text-chalk/80">
                Ten looks, from Scandinavian minimal to maximalist. Everything in
                each one fits together.
              </span>
            </Link>
          </li>
        </ol>
      </section>

      {/* Bestsellers */}
      <section className="border-b border-ink">
        <SectionHead index="02" title="Most ordered" aside="Reorder rate above 30%" href={categoryHref("Living")} />
        <ul className="rule-grid border-t border-rule grid-cols-2 lg:grid-cols-4">
          {bestsellers.map((p) => (
            <li key={p.id}>
              <ProductCard product={p} />
            </li>
          ))}
          <GridFill count={bestsellers.length} cols={{ base: 2, lg: 4 }} />
        </ul>
      </section>

      {/* Styles strip */}
      <section className="border-b border-ink">
        <SectionHead index="03" title="Ten styles" aside="One standard" />
        <ol className="border-t border-rule">
          {store.styles.map((s, i) => {
            const items = marlow.withStyle(s.id);
            return (
              <li key={s.id} className="border-b border-rule last:border-0">
                <Link
                  href={styleHref(s.id)}
                  className="group grid items-center gap-4 px-4 py-3 transition-colors hover:bg-ink hover:text-chalk sm:grid-cols-[3rem_1fr_1fr_auto] sm:px-6"
                >
                  <span className="mono text-mute group-hover:text-chalk/60">{String(i + 1).padStart(2, "0")}</span>
                  <span className="display text-4xl sm:text-5xl">{s.label}</span>
                  <span className="hidden text-sm text-mute group-hover:text-chalk/70 sm:block">{s.description}</span>
                  <span className="mono text-mute group-hover:text-chalk/60">{items.length} pcs →</span>
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      {/* New */}
      <section className="border-b border-ink">
        <SectionHead index="04" title="Just landed" aside="Added this month" />
        <ul className="rule-grid border-t border-rule grid-cols-2 lg:grid-cols-3">
          {newArrivals.map((p) => (
            <li key={p.id}>
              <ProductCard product={p} />
            </li>
          ))}
          <GridFill count={newArrivals.length} cols={{ base: 2, lg: 3 }} />
        </ul>
      </section>

      {/* Manifesto */}
      <section className="rule-grid lg:grid-cols-3">
        {[
          ["Made to last", "Solid wood, full-grain leather, kiln-fired stoneware. Repairable, not disposable. Spare parts for ten years."],
          ["Workshops, not factories", "Twenty-two partner workshops across Oregon, Portugal, Vietnam and Japan. We name them on every product page."],
          ["Honest pricing", "No fake sales. The price is what the thing costs to make well, plus a fair margin. It won't be different next week."],
        ].map(([title, body], i) => (
          <div key={title} className="p-6 sm:p-8">
            <p className="mono text-mute">0{i + 1}</p>
            <h3 className="display mt-6 text-5xl">{title}</h3>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-mute">{body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}

function HeroCaption({ product }: { product: Parameters<typeof ProductImage>[0]["product"] }) {
  return (
    <span className="mono absolute bottom-3 left-3 flex max-w-[calc(100%-1.5rem)] gap-3 bg-chalk px-2 py-1">
      <span className="shrink-0 text-mute">№ {catalogNumber(product)}</span>
      <span className="truncate">{product.name}</span>
      <span className="shrink-0">${product.price}</span>
    </span>
  );
}

function SectionHead({
  index,
  title,
  aside,
  href,
}: {
  index: string;
  title: string;
  aside?: string;
  href?: string;
}) {
  return (
    <div className="flex items-end justify-between gap-4 px-4 pb-4 pt-12 sm:px-6">
      <div className="flex items-baseline gap-4">
        <span className="mono text-mute">{index}</span>
        <h2 className="display text-6xl sm:text-7xl">{title}</h2>
      </div>
      {href ? (
        <Link href={href} className="mono text-mute link-rule hover:text-ink">
          {aside} →
        </Link>
      ) : (
        aside && <p className="mono hidden text-mute sm:block">{aside}</p>
      )}
    </div>
  );
}

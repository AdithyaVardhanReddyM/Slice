import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Truck } from "lucide-react";
import { CoffeeCard } from "@/components/halfmoon/coffee-card";
import { Header } from "@/components/halfmoon/header";
import { JsonLd, productJsonLd } from "@/lib/halfmoon/jsonld";
import { CLUB, COFFEES, clubPrice, coffeeBySlug, href, img, money } from "@/lib/halfmoon/site";

export function generateStaticParams() {
  return COFFEES.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: PageProps<"/halfmoon/coffee/[slug]">) {
  const { slug } = await params;
  const c = coffeeBySlug(slug);
  if (!c) return { title: "Coffee" };
  return {
    title: `${c.name}, ${c.kind.toLowerCase()}`,
    description: `${c.description} ${c.notes.join(", ")}. ${money(c.price)} for ${c.size}.`,
    openGraph: { images: [{ url: img(c.photo), alt: c.photoAlt }] },
  };
}

const GRINDS = ["Whole bean", "Pour-over", "Espresso", "French press", "Drip"];

export default async function CoffeePage({ params }: PageProps<"/halfmoon/coffee/[slug]">) {
  const { slug } = await params;
  const c = coffeeBySlug(slug);
  if (!c) notFound();
  const others = COFFEES.filter((o) => o.slug !== c.slug);
  const facts = [
    ["Origin", c.origin],
    ["Process", c.process],
    ...(c.altitude ? [["Altitude", c.altitude]] : []),
    ["Brew with", c.brewWith],
    ["Size", c.size],
  ];

  return (
    <main className="pb-24">
      <JsonLd data={productJsonLd(c)} />
      <Header />
      <div className="hm-container">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-[14px] text-(--hm-mute)">
          <Link href={href.shop} className="hover:text-(--hm-ink)">
            Coffee
          </Link>
          <ChevronRight className="size-3.5" />
          <span className="text-(--hm-ink)">{c.name}</span>
        </nav>

        <div className="mt-6 grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-[32px] sm:aspect-[5/4] lg:aspect-auto lg:min-h-[640px]" style={{ background: c.tint }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img(c.image)} alt={c.imageAlt} fetchPriority="high" className={c.isCan ? "h-[78%] w-auto" : "h-[86%] w-auto"} />
          </div>

          <div className="lg:py-6">
            <p className="hm-eyebrow">{c.kind}</p>
            <h1 className="hm-display mt-3 text-[56px] sm:text-[72px]">{c.name}</h1>
            <p className="mt-4 text-[17.5px] leading-relaxed text-(--hm-ink-soft)">{c.description}</p>
            <ul className="mt-6 flex flex-wrap gap-2" aria-label="Tasting notes">
              {c.notes.map((n) => (
                <li key={n} className="rounded-full px-3.5 py-1.5 text-[14px] font-medium" style={{ background: c.tint }}>
                  {n}
                </li>
              ))}
            </ul>

            <div className="mt-8 flex items-baseline gap-3">
              <span className="hm-display text-[36px]">{money(c.price)}</span>
              <span className="text-[15px] text-(--hm-ink-soft)">{c.size}</span>
            </div>

            {!c.isCan && (
              <fieldset className="mt-6">
                <legend className="text-[14px] font-semibold">Grind</legend>
                <div className="mt-3 flex flex-wrap gap-2">
                  {GRINDS.map((g, i) => (
                    <label key={g} className="cursor-pointer">
                      <input type="radio" name="grind" defaultChecked={i === 0} className="peer sr-only" />
                      <span className="inline-flex h-10 items-center rounded-full px-4 text-[14px] font-medium shadow-[inset_0_0_0_1.5px_var(--hm-line)] peer-checked:bg-(--hm-ink) peer-checked:text-white peer-checked:shadow-none peer-focus-visible:outline-2">{g}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <button type="button" className="hm-btn hm-btn-ink w-full">
                Add to bag, {money(c.price)}
              </button>
              <Link href={href.club} className="hm-btn hm-btn-line w-full">
                {CLUB.name}: {clubPrice(c)}
              </Link>
            </div>
            <p className="mt-4 flex items-center gap-2 text-[14px] text-(--hm-ink-soft)">
              <Truck className="size-4" /> Roasted this week, ships within 48 hours. Free shipping over $40.
            </p>

            <dl className="mt-10 divide-y divide-(--hm-line) border-y border-(--hm-line)">
              {facts.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[120px_1fr] gap-4 py-3.5 text-[15px]">
                  <dt className="text-(--hm-mute)">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <figure className="mt-20 overflow-hidden rounded-[32px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img(c.photo)} alt={c.photoAlt} loading="lazy" className="aspect-[4/5] w-full object-cover sm:aspect-[16/9]" />
        </figure>

        <section className="pt-24" aria-labelledby="more">
          <h2 id="more" className="hm-display text-[40px] sm:text-[52px]">
            The other three
          </h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {others.map((o) => (
              <CoffeeCard key={o.slug} c={o} className="min-h-[520px] sm:min-h-[540px]" />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

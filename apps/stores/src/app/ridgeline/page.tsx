import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cafes, coffees, formatDate, gifts, href, plans, posts, ridgeline, sceneSrc } from "@/lib/ridgeline";
import { money } from "@/lib/format";
import { ProductCard } from "@/components/ridgeline/product-card";
import { Scene } from "@/components/ridgeline/product-image";

const SITE = "http://localhost:3002";

export default function RidgelineHome() {
  const { store } = ridgeline;
  const featured = coffees().filter((p) => p.bestseller || p.new).slice(0, 4);
  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: store.name,
    url: `${SITE}/ridgeline`,
    logo: `${SITE}/ridgeline/logo.svg`,
    description: store.description,
    foundingDate: "2016",
    address: { "@type": "PostalAddress", streetAddress: "2211 NE Alberta St", addressLocality: "Portland", addressRegion: "OR", postalCode: "97211", addressCountry: "US" },
    sameAs: ["https://www.instagram.com/ridgelinecoffee"],
  };

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }} />

      {/* Hero */}
      <section className="rl-container grid gap-8 py-10 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:py-16">
        <div className="max-w-xl">
          <p className="text-sm font-semibold text-rl-rust">Roasted on Alberta Street, Portland</p>
          <h1 className="rl-serif mt-4 text-[44px] sm:text-[60px] lg:text-[68px]">
            Coffee from farms we visit, roasted the week you order it.
          </h1>
          <p className="mt-6 max-w-md text-[17px] leading-relaxed text-rl-ink-soft">
            Twelve coffees, three subscription plans and two cafés, with a third opening in Austin this November.
            Every bag ships within 48 hours of leaving the roaster.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={href.coffee} className="rounded-[4px] bg-rl-rust px-6 py-3.5 text-[15px] font-semibold text-rl-cream hover:bg-rl-rust-deep">
              Shop coffee
            </Link>
            <Link href={href.subscriptions} className="rounded-[4px] border border-rl-ink px-6 py-3.5 text-[15px] font-semibold hover:bg-rl-ink hover:text-rl-cream">
              Start a subscription
            </Link>
          </div>
        </div>
        <div className="aspect-[4/5] overflow-hidden rounded-[4px] bg-rl-sand sm:aspect-[5/4] lg:aspect-[4/5]">
          <Scene src={sceneSrc("scene-home-hero")} alt="A barista pouring a flat white at the Alberta Street bar" priority />
        </div>
      </section>

      {/* Featured coffees */}
      <section className="rl-container mt-10">
        <div className="flex items-end justify-between gap-6">
          <div>
            <h2 className="rl-serif text-[32px] sm:text-[38px]">On the roaster this week</h2>
            <p className="mt-2 text-rl-mute">Bestsellers and new arrivals. Twelve coffees in all.</p>
          </div>
          <Link href={href.coffee} className="hidden shrink-0 items-center gap-1.5 text-[15px] font-semibold hover:text-rl-rust sm:flex">
            All coffee <ArrowRight className="size-4" />
          </Link>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-10 lg:grid-cols-4">
          {featured.map((p) => (
            <ProductCard key={p.id} product={p} sizes="(min-width: 1024px) 25vw, 50vw" />
          ))}
        </div>
      </section>

      {/* Profiles */}
      <section className="rl-container mt-24">
        <h2 className="rl-serif text-[32px] sm:text-[38px]">Find your coffee by how it tastes</h2>
        <p className="mt-2 max-w-xl text-rl-mute">
          We sort roasts by profile rather than country, because the same origin can be bright one year and chocolatey the next.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {store.styles.map((s) => {
            const count = ridgeline.withStyle(s.id).filter((p) => p.category === "Coffee").length;
            return (
              <Link
                key={s.id}
                href={`${href.coffee}?profile=${s.id}`}
                className="group flex flex-col rounded-[4px] border border-rl-line bg-rl-cream-deep p-6 transition-colors hover:border-rl-rust"
              >
                <h3 className="rl-serif text-[24px] group-hover:text-rl-rust">{s.label}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-rl-ink-soft">{s.description}</p>
                <p className="mt-5 text-sm font-semibold">
                  {count} coffees <ArrowRight className="ml-1 inline size-4" />
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Subscriptions */}
      <section className="mt-24 bg-rl-ink text-rl-cream">
        <div className="rl-container grid gap-10 py-16 lg:grid-cols-[1fr_1.2fr] lg:gap-16 lg:py-24">
          <div className="aspect-[4/5] overflow-hidden rounded-[4px] bg-rl-ink-soft lg:order-2">
            <Scene src={sceneSrc("scene-subscriptions")} alt="Ridgeline bags with coloured labels on a shelf" />
          </div>
          <div className="lg:order-1 lg:self-center">
            <p className="text-sm font-semibold text-rl-sand">Subscriptions</p>
            <h2 className="rl-serif mt-3 text-[36px] sm:text-[44px]">Never run out. Never pay for shipping.</h2>
            <p className="mt-5 max-w-md text-[17px] leading-relaxed text-rl-cream/75">
              Three plans, every week to every four weeks, roasted the day before they ship. Pause or change the bag from your account whenever you like.
            </p>
            <ul className="mt-8 divide-y divide-rl-cream/15 border-y border-rl-cream/15">
              {plans().map((p) => (
                <li key={p.id}>
                  <Link href={href.product(p)} className="group flex items-baseline justify-between gap-4 py-4">
                    <span>
                      <span className="rl-serif text-[22px] group-hover:text-rl-sand">{p.name}</span>
                      <span className="mt-0.5 block text-sm text-rl-cream/60">{p.details[0]}</span>
                    </span>
                    <span className="shrink-0 text-[15px] font-semibold tabular-nums">
                      {money(p.price)} <span className="text-rl-cream/60">/ delivery</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <Link href={href.subscriptions} className="mt-8 inline-block rounded-[4px] bg-rl-cream px-6 py-3.5 text-[15px] font-semibold text-rl-ink hover:bg-rl-sand">
              Compare plans
            </Link>
          </div>
        </div>
      </section>

      {/* Cafés */}
      <section className="rl-container mt-24">
        <div className="flex items-end justify-between gap-6">
          <div>
            <h2 className="rl-serif text-[32px] sm:text-[38px]">Our cafés</h2>
            <p className="mt-2 text-rl-mute">Portland and Seattle today. Austin opens in November.</p>
          </div>
          <Link href={href.cafes} className="hidden shrink-0 items-center gap-1.5 text-[15px] font-semibold hover:text-rl-rust sm:flex">
            Hours and addresses <ArrowRight className="size-4" />
          </Link>
        </div>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {cafes.map((c) => (
            <Link key={c.slug} href={`${href.cafes}#${c.slug}`} className="group block">
              <div className="relative aspect-[4/3] overflow-hidden rounded-[4px] bg-rl-sand">
                <Scene src={sceneSrc(c.scene)} alt={`${c.name}, ${c.city}`} className="transition-transform duration-700 group-hover:scale-[1.03]" />
                {c.opening && (
                  <span className="absolute left-3 top-3 rounded-[3px] bg-rl-rust px-2 py-1 text-xs font-semibold text-rl-cream">{c.opening}</span>
                )}
              </div>
              <h3 className="rl-serif mt-4 text-[24px] group-hover:text-rl-rust">{c.city}</h3>
              <p className="mt-1 text-sm text-rl-mute">
                {c.address.join(", ")}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* Gifts + journal */}
      <section className="rl-container mt-24 grid gap-16 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <div className="flex items-end justify-between gap-6">
            <h2 className="rl-serif text-[32px]">Gift sets</h2>
            <Link href={href.gifts} className="shrink-0 text-[15px] font-semibold hover:text-rl-rust">All gifts</Link>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-8">
            {gifts().slice(0, 4).map((p) => (
              <ProductCard key={p.id} product={p} sizes="(min-width: 1024px) 25vw, 50vw" />
            ))}
          </div>
        </div>
        <div>
          <div className="flex items-end justify-between gap-6">
            <h2 className="rl-serif text-[32px]">From the journal</h2>
            <Link href={href.journal} className="shrink-0 text-[15px] font-semibold hover:text-rl-rust">All posts</Link>
          </div>
          <ul className="mt-6 divide-y divide-rl-line border-y border-rl-line">
            {posts.map((post) => (
              <li key={post.slug}>
                <Link href={href.post(post.slug)} className="group flex gap-5 py-5">
                  <div className="h-24 w-20 shrink-0 overflow-hidden rounded-[4px] bg-rl-sand">
                    <Scene src={sceneSrc(post.scene)} alt="" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-rl-mute">{formatDate(post.date)}</p>
                    <h3 className="rl-serif mt-1 text-[21px] leading-snug group-hover:text-rl-rust">{post.title}</h3>
                    <p className="mt-1 line-clamp-2 text-sm text-rl-ink-soft">{post.standfirst}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}

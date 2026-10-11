import Link from "next/link";
import type { Metadata } from "next";
import { cn } from "cn";
import { coffees, href, ridgeline, slugify, styleLabel } from "@/lib/ridgeline";
import { ProductCard } from "@/components/ridgeline/product-card";

export const metadata: Metadata = {
  title: "Coffee",
  description: "Twelve coffees roasted in Portland: single origins, blends, decaf and instant sticks. Roasted to order, shipped within 48 hours.",
};

const types = ridgeline.store.nav.find((g) => g.category === "Coffee")?.subcategories ?? [];

export default async function CoffeePage({ searchParams }: PageProps<"/ridgeline/coffee">) {
  const sp = await searchParams;
  const type = typeof sp.type === "string" ? sp.type : undefined;
  const profile = typeof sp.profile === "string" ? sp.profile : undefined;
  const all = coffees();
  const list = all.filter((p) => (!type || slugify(p.subcategory) === type) && (!profile || p.attributes.style.includes(profile)));
  const activeType = types.find((t) => slugify(t) === type);

  return (
    <main className="rl-container py-10">
      <header className="max-w-2xl">
        <h1 className="rl-serif text-[40px] sm:text-[52px]">{activeType ?? "Coffee"}</h1>
        <p className="mt-4 text-[17px] text-rl-ink-soft">
          {activeType === "Single origins" && "One farm or washing station per bag, bought directly and roasted to show where it came from."}
          {activeType === "Blends" && "Built for a job: the daily pot, the espresso machine, the cold brew jar. The same taste every time."}
          {activeType === "Decaf" && "Sugarcane and Swiss Water decafs roasted with the same care as everything else. Nobody will notice."}
          {activeType === "Instant" && "Our house blend brewed properly and freeze-dried into sticks. Real coffee for the trail and the office."}
          {!activeType && "Twelve coffees, roasted Tuesday to Friday on Alberta Street and shipped within 48 hours. Filter by type or by how you like your coffee to taste."}
        </p>
      </header>

      <div className="mt-8 flex flex-wrap items-center gap-2 border-y border-rl-line py-4">
        <Chip to={profile ? `${href.coffee}?profile=${profile}` : href.coffee} active={!type}>All types</Chip>
        {types.map((t) => (
          <Chip key={t} to={`${href.coffee}?type=${slugify(t)}${profile ? `&profile=${profile}` : ""}`} active={slugify(t) === type}>
            {t}
          </Chip>
        ))}
        <span className="mx-2 hidden h-5 w-px bg-rl-line sm:block" />
        {ridgeline.store.styles.map((s) => (
          <Chip key={s.id} to={`${href.coffee}?${type ? `type=${type}&` : ""}${s.id === profile ? "" : `profile=${s.id}`}`} active={s.id === profile} tone="rust">
            {s.label}
          </Chip>
        ))}
      </div>

      <p className="mt-6 text-sm text-rl-mute">
        {list.length} {list.length === 1 ? "coffee" : "coffees"}
        {profile ? ` · ${styleLabel(profile)}` : ""}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-10 lg:grid-cols-4">
        {list.map((p, i) => (
          <ProductCard key={p.id} product={p} sizes="(min-width: 1024px) 25vw, 50vw" className={i < 4 ? "" : undefined} />
        ))}
      </div>
      {list.length === 0 && (
        <p className="py-16 text-center text-rl-mute">
          Nothing matches that combination. <Link href={href.coffee} className="underline">Show all coffee</Link>
        </p>
      )}
    </main>
  );
}

function Chip({ to, active, children, tone }: { to: string; active: boolean; children: React.ReactNode; tone?: "rust" }) {
  return (
    <Link
      href={to}
      className={cn(
        "rounded-[4px] border px-3.5 py-1.5 text-sm font-medium transition-colors",
        active
          ? tone === "rust"
            ? "border-rl-rust bg-rl-rust text-rl-cream"
            : "border-rl-ink bg-rl-ink text-rl-cream"
          : "border-rl-line hover:border-rl-ink",
      )}
    >
      {children}
    </Link>
  );
}

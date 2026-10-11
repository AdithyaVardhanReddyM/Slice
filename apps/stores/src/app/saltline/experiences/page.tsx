import type { Metadata } from "next";
import Link from "next/link";
import { cn } from "cn";
import { experiences, href, openHotels, saltline } from "@/lib/saltline";
import { ItemCard } from "@/components/saltline/item-card";

export const metadata: Metadata = {
  title: "Experiences",
  description: "Twelve bookable experiences across Saltline's hotels: market breakfasts, harbour swims, surf mornings, design walks, natural wine dinners and a sailing afternoon.",
};

const kinds = saltline.store.nav.find((g) => g.category === "Experiences")?.subcategories ?? [];

export default async function ExperiencesPage({ searchParams }: PageProps<"/saltline/experiences">) {
  const sp = await searchParams;
  const city = typeof sp.city === "string" ? sp.city : undefined;
  const kind = typeof sp.kind === "string" ? sp.kind : undefined;
  const list = experiences().filter((p) => (!city || p.tags.includes(city)) && (!kind || p.subcategory === kind));
  const q = (c?: string, k?: string) => {
    const params = new URLSearchParams();
    if (c) params.set("city", c);
    if (k) params.set("kind", k);
    const s = params.toString();
    return `${href.experiences}${s ? `?${s}` : ""}`;
  };

  return (
    <main className="sl-container py-10 lg:py-14">
      <header className="max-w-2xl">
        <h1 className="sl-serif text-[48px] sm:text-[64px]">Experiences</h1>
        <p className="mt-5 text-[17px] text-sl-charcoal-soft">
          Twelve things we arrange, four in each city, led by our chefs, our guest teams and friends of the hotels. Book before you arrive or at reception; most run in small groups and fill up.
        </p>
      </header>

      <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 border-y border-sl-line py-4 text-[15px]">
        <Chip to={q(undefined, kind)} active={!city}>All cities</Chip>
        {openHotels.map((h) => (
          <Chip key={h.slug} to={q(h.slug, kind)} active={city === h.slug}>{h.city}</Chip>
        ))}
        <span className="hidden h-4 w-px bg-sl-line sm:block" />
        {kinds.map((k) => (
          <Chip key={k} to={q(city, kind === k ? undefined : k)} active={kind === k}>{k}</Chip>
        ))}
      </div>

      <p className="mt-6 text-sm text-sl-mute">{list.length} experiences</p>
      <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-12 lg:grid-cols-4">
        {list.map((p, i) => (
          <ItemCard key={p.id} product={p} sizes="(min-width: 1024px) 25vw, 50vw" priority={i < 4} />
        ))}
      </div>
      {list.length === 0 && (
        <p className="py-16 text-center text-sl-mute">
          Nothing matches. <Link href={href.experiences} className="underline">Show everything</Link>
        </p>
      )}
    </main>
  );
}

function Chip({ to, active, children }: { to: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={to} className={cn("transition-colors hover:text-sl-charcoal", active ? "text-sl-charcoal underline decoration-sl-sea decoration-[1.5px] underline-offset-[7px]" : "text-sl-mute")}>
      {children}
    </Link>
  );
}

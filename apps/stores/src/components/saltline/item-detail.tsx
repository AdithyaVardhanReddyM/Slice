import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Product } from "@slice/demo-catalogs";
import { cityOf, experiences, href, rooms, saltline, styleLabel } from "@/lib/saltline";
import { money } from "@/lib/format";
import { ProductJsonLd } from "@/components/product-json-ld";
import { ItemCard } from "./item-card";
import { ProductPhoto } from "./photo";

const SITE = "http://localhost:3002";

export function ItemDetail({ product, parent }: { product: Product; parent: { name: string; url: string } }) {
  const hotel = cityOf(product);
  const isRoom = product.category === "Rooms";
  const isExp = product.category === "Experiences";
  const unit = isRoom ? "per night" : isExp ? "per guest" : "per stay, for two";
  const related = isRoom
    ? rooms(product.subcategory).filter((p) => p.id !== product.id)
    : isExp
      ? experiences(hotel?.city).filter((p) => p.id !== product.id)
      : saltline.inCategory("Offers").filter((p) => p.id !== product.id);
  const planParams: Record<string, string> = isRoom
    ? { hotel: hotel?.slug ?? "", room: product.name }
    : isExp
      ? { hotel: hotel?.slug ?? "", interest: product.name }
      : { offer: product.name };

  return (
    <main>
      <ProductJsonLd
        product={product}
        storeName={saltline.store.name}
        url={`${SITE}${href.product(product)}`}
        breadcrumbs={[
          { name: "Home", url: `${SITE}${href.home}` },
          { name: parent.name, url: `${SITE}${parent.url}` },
          { name: product.name, url: `${SITE}${href.product(product)}` },
        ]}
      />
      <nav className="sl-container flex flex-wrap items-center gap-1 pt-6 text-sm text-sl-mute" aria-label="Breadcrumb">
        <Link href={href.home} className="hover:text-sl-charcoal">Home</Link>
        <ChevronRight className="size-3.5" />
        <Link href={parent.url} className="hover:text-sl-charcoal">{parent.name}</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-sl-charcoal">{product.name}</span>
      </nav>

      <div className="sl-container mt-6 grid gap-10 lg:grid-cols-[1.25fr_1fr] lg:gap-20">
        <div className="aspect-[4/5] overflow-hidden bg-sl-stone sm:aspect-[5/4] lg:aspect-[4/5]">
          <ProductPhoto product={product} priority sizes="(min-width: 1024px) 55vw, 100vw" />
        </div>

        <div className="lg:py-6">
          <p className="text-sm text-sl-sea-deep">
            {isExp && hotel && <>{product.subcategory} at </>}
            {hotel ? (
              <Link href={href.hotel(hotel.slug)} className="hover:underline">{hotel.name}</Link>
            ) : (
              "All hotels"
            )}
          </p>
          <h1 className="sl-serif mt-3 text-[40px] sm:text-[52px]">{product.name}</h1>
          <p className="mt-4 text-[17px]">
            {product.compareAtPrice && <span className="mr-2 text-sl-mute line-through">{money(product.compareAtPrice)}</span>}
            <span className="font-medium">{isRoom || isExp ? `From ${money(product.price)}` : money(product.price)}</span>{" "}
            <span className="text-sl-mute">{unit}</span>
          </p>
          <p className="mt-6 text-[17px] leading-relaxed text-sl-charcoal-soft">{product.description}</p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={href.plan(planParams)}
              className="bg-sl-charcoal px-7 py-3.5 text-[15px] font-medium text-sl-paper transition-colors hover:bg-sl-sea-deep"
            >
              {isRoom ? "Check availability" : isExp ? "Book this experience" : "Enquire about this offer"}
            </Link>
            {hotel && (
              <Link href={href.hotel(hotel.slug)} className="border border-sl-charcoal px-7 py-3.5 text-[15px] font-medium hover:bg-sl-charcoal hover:text-sl-paper">
                About the hotel
              </Link>
            )}
          </div>
          <p className="mt-3 text-sm text-sl-mute">
            {isRoom
              ? "Free cancellation until 48 hours before arrival. Breakfast included."
              : isExp
                ? "Book at reception or in advance; we confirm by email within a day."
                : "Subject to availability. Our team replies within one working day."}
          </p>

          <div className="mt-10 border-t border-sl-line pt-6">
            <h2 className="text-[15px] font-medium">{isRoom ? "The room" : isExp ? "The details" : "What is included"}</h2>
            <ul className="mt-3 space-y-2 text-[15px] text-sl-charcoal-soft">
              {product.details.map((d) => (
                <li key={d} className="flex gap-3">
                  <span className="mt-[11px] h-px w-3 shrink-0 bg-sl-sea" />
                  {d}
                </li>
              ))}
            </ul>
            <p className="mt-5 text-sm text-sl-mute">Good for: {product.attributes.style.map(styleLabel).join(", ").toLowerCase()}</p>
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="sl-container mt-24">
          <h2 className="sl-serif text-[34px]">
            {isRoom ? `Other rooms in ${product.subcategory}` : isExp ? `More in ${hotel?.city ?? "the city"}` : "Other offers"}
          </h2>
          <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-12 lg:grid-cols-3">
            {related.slice(0, 3).map((p) => (
              <ItemCard key={p.id} product={p} sizes="(min-width: 1024px) 33vw, 50vw" />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

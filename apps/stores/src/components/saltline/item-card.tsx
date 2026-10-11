import Link from "next/link";
import type { Product } from "@slice/demo-catalogs";
import { cn } from "cn";
import { cityOf, href } from "@/lib/saltline";
import { money } from "@/lib/format";
import { ProductPhoto } from "./photo";

const unit = (p: Product) =>
  p.category === "Rooms" ? "per night" : p.category === "Experiences" ? "per guest" : "per stay";

const meta = (p: Product) => {
  if (p.category === "Rooms") return p.details[0];
  if (p.category === "Experiences") return `${cityOf(p)?.city ?? ""} · ${p.subcategory}`;
  return p.details[0];
};

export function ItemCard({
  product,
  className,
  sizes,
  aspect = "aspect-[4/5]",
  priority,
}: {
  product: Product;
  className?: string;
  sizes?: string;
  aspect?: string;
  priority?: boolean;
}) {
  return (
    <Link href={href.product(product)} className={cn("group block", className)}>
      <div className={cn("overflow-hidden bg-sl-stone", aspect)}>
        <ProductPhoto
          product={product}
          sizes={sizes}
          priority={priority}
          className="transition-transform duration-[1200ms] ease-out group-hover:scale-[1.04]"
        />
      </div>
      <h3 className="sl-serif mt-4 text-[24px] leading-tight text-sl-charcoal">{product.name}</h3>
      <p className="mt-1.5 text-sm text-sl-mute">
        {product.compareAtPrice ? <span className="mr-1.5 line-through">{money(product.compareAtPrice)}</span> : null}
        <span className="text-sl-charcoal">{money(product.price)}</span> {unit(product)}
        <span className="mx-1.5">·</span>
        {meta(product)}
      </p>
    </Link>
  );
}

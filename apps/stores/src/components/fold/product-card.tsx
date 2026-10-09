import Link from "next/link";
import type { Product } from "@slice/demo-catalogs";
import { cn } from "cn";
import { href } from "@/lib/fold";
import { money } from "@/lib/format";
import { swatch } from "@/lib/swatches";
import { HeartButton } from "./heart-button";
import { ProductImage } from "./product-image";

const sizeLabel = (label: string) => label.replace(/^EU\s*/, "");

// Image on a soft grey ground, brand in bold over the product name, price.
// Hovering shows which sizes are left.
export function ProductCard({
  product,
  priority,
  className,
  sizes,
}: {
  product: Product;
  priority?: boolean;
  className?: string;
  sizes?: string;
}) {
  const onSale = product.compareAtPrice !== undefined;
  const soldOut = product.variants.every((v) => !v.inStock);
  const badge = soldOut
    ? "Sold out"
    : onSale
      ? `−${Math.round((1 - product.price / product.compareAtPrice!) * 100)}%`
      : product.new
        ? "New in"
        : product.bestseller
          ? "Bestseller"
          : null;
  const showSizes = product.variants.length > 1 && !soldOut;
  const colors = product.attributes.colors.slice(0, 4);

  return (
    <div className={cn("group relative", className)}>
      <Link href={href.product(product.slug)} className="block">
        <div className="relative aspect-[3/4] overflow-hidden bg-fd-mist">
          <ProductImage
            product={product}
            priority={priority}
            sizes={sizes}
            className="transition-transform duration-700 ease-fd group-hover:scale-[1.03]"
          />
          {badge && (
            <span
              className={cn(
                "absolute left-2.5 top-2.5 rounded-sm px-2 py-0.5 text-xs font-medium",
                badge.startsWith("−") ? "bg-fd-sale text-white" : badge === "New in" ? "bg-fd-forest text-white" : "bg-white text-fd-ink",
              )}
            >
              {badge}
            </span>
          )}
          {showSizes && (
            <div className="absolute inset-x-2 bottom-2 hidden translate-y-2 rounded-sm bg-white/95 px-3 py-2 opacity-0 shadow-sm backdrop-blur transition duration-300 ease-fd group-hover:translate-y-0 group-hover:opacity-100 lg:block">
              <p className="text-[11px] text-fd-mute">Sizes available</p>
              <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs font-medium">
                {product.variants.map((v) => (
                  <span key={v.id} className={cn(!v.inStock && "text-fd-mute/60 line-through")}>
                    {sizeLabel(v.label)}
                  </span>
                ))}
              </p>
            </div>
          )}
        </div>
        <div className="mt-3 pr-8">
          <p className="text-sm font-semibold">{product.brand}</p>
          <h3 className="mt-0.5 truncate text-sm text-fd-ink-2">{product.name}</h3>
          <p className="mt-1.5 text-sm">
            {onSale ? (
              <>
                <span className="font-semibold text-fd-sale">{money(product.price)}</span>
                <span className="ml-2 text-fd-mute line-through">{money(product.compareAtPrice!)}</span>
              </>
            ) : (
              <span className="font-semibold">{money(product.price)}</span>
            )}
          </p>
          {colors.length > 1 && (
            <p className="mt-2 flex items-center gap-1" aria-label={`Colours: ${colors.join(", ")}`}>
              {colors.map((c) => (
                <span key={c} className="size-2.5 rounded-full ring-1 ring-black/15" style={{ background: swatch(c) }} />
              ))}
            </p>
          )}
        </div>
      </Link>
      <HeartButton
        productId={product.id}
        className="absolute right-2 top-2 size-9 rounded-full bg-white/90 text-fd-ink shadow-sm hover:bg-white"
      />
    </div>
  );
}

import Link from "next/link";
import type { Product } from "@slice/demo-catalogs";
import { cn } from "cn";
import { href } from "@/lib/fold";
import { money } from "@/lib/format";
import { ProductImage } from "./product-image";

const sizeLabel = (label: string) => label.replace(/^EU\s*/, "");

// Brand over name over price, the way fashion retailers list things. The
// photo is dog-eared; on hover the corner opens and the sizes in stock show.
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
  const inStock = product.variants.filter((v) => v.inStock);
  const soldOut = inStock.length === 0;
  const flag = soldOut ? "Sold out" : onSale ? "Sale" : product.new ? "Just in" : null;
  const showSizes = product.variants.length > 1 && !soldOut;

  return (
    <Link href={href.product(product.slug)} className={cn("group block", className)}>
      <div className="dog-ear relative aspect-[3/4]">
        <div className="sheet absolute inset-0 overflow-hidden bg-night-3">
          <ProductImage
            product={product}
            priority={priority}
            sizes={sizes}
            className="transition-transform duration-[900ms] ease-fold group-hover:scale-[1.035]"
          />
          {flag && (
            <span
              className={cn(
                "tag absolute left-3 top-3 px-2 py-1",
                flag === "Sale" ? "bg-signal text-night" : "bg-night/80 text-bone backdrop-blur",
              )}
            >
              {flag}
            </span>
          )}
          {showSizes && (
            <div className="absolute inset-x-0 bottom-0 translate-y-full bg-night/85 px-3 py-2.5 backdrop-blur transition-transform duration-500 ease-fold group-hover:translate-y-0">
              <p className="tag flex flex-wrap gap-x-2.5 gap-y-1 text-bone">
                {product.variants.map((v) => (
                  <span key={v.id} className={cn(!v.inStock && "text-fog line-through")}>
                    {sizeLabel(v.label)}
                  </span>
                ))}
              </p>
            </div>
          )}
        </div>
        <span className="flap" aria-hidden />
      </div>
      <div className="mt-3.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="tag text-bone">{product.brand}</p>
          <h3 className="mt-1 truncate text-[14px] leading-snug text-bone-2">{product.name}</h3>
        </div>
        <p className="shrink-0 text-right text-[14px] tabular-nums">
          {onSale && (
            <span className="block text-fog line-through">{money(product.compareAtPrice!)}</span>
          )}
          <span className={cn(onSale && "text-signal")}>{money(product.price)}</span>
        </p>
      </div>
    </Link>
  );
}

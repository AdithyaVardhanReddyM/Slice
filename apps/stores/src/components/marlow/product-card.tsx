import Link from "next/link";
import type { Product } from "@slice/demo-catalogs";
import { cn } from "cn";
import { productHref } from "@/lib/catalog";
import { money } from "@/lib/format";
import { ProductImage } from "./product-image";

export const catalogNumber = (p: Product) => p.id.split("-").pop()!.padStart(3, "0");

// A cell in the hairline grid: the parent provides the rules, the card fills
// the cell edge to edge.
export function ProductCard({
  product,
  className,
  priority,
}: {
  product: Product;
  className?: string;
  priority?: boolean;
}) {
  const onSale = product.compareAtPrice !== undefined;
  const soldOut = product.variants.every((v) => !v.inStock);
  const flag = soldOut ? "Sold out" : onSale ? "Sale" : product.new ? "New" : product.bestseller ? "Bestseller" : null;

  return (
    <Link href={productHref(product.slug)} className={cn("group flex h-full flex-col", className)}>
      <div className="relative aspect-[4/5] overflow-hidden bg-stone">
        <ProductImage
          product={product}
          priority={priority}
          className="transition-transform duration-700 ease-out-soft group-hover:scale-[1.04]"
        />
        <span className="mono absolute bottom-3 right-3 text-ink/60 mix-blend-multiply">
          № {catalogNumber(product)}
        </span>
        {flag && (
          <span
            className={cn(
              "mono absolute bottom-3 left-3 px-1.5 py-0.5",
              flag === "Sale" ? "bg-cobalt text-chalk" : "bg-ink text-chalk",
            )}
          >
            {flag}
          </span>
        )}
      </div>
      <div className="flex flex-1 items-start justify-between gap-3 px-3 py-3">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-medium leading-tight link-rule group-hover:decoration-ink">
            {product.name}
          </h3>
          <p className="mono mt-1.5 text-mute">{product.category}</p>
        </div>
        <p className="mono-lg shrink-0 text-right">
          {onSale && (
            <span className="block text-mute line-through">{money(product.compareAtPrice!)}</span>
          )}
          <span className={cn(onSale && "text-cobalt")}>{money(product.price)}</span>
        </p>
      </div>
    </Link>
  );
}

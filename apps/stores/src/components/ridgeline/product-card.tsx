import Link from "next/link";
import type { Product } from "@slice/demo-catalogs";
import { cn } from "cn";
import { href, styleLabel } from "@/lib/ridgeline";
import { money } from "@/lib/format";
import { ProductImage } from "./product-image";

const note = (p: Product) => p.details.find((d) => d.startsWith("Tasting notes:"))?.replace("Tasting notes: ", "");
const roast = (p: Product) => p.details.find((d) => d.startsWith("Roast:"))?.replace("Roast: ", "");

export function ProductCard({ product, className, sizes }: { product: Product; className?: string; sizes?: string }) {
  const tasting = note(product);
  const roastLevel = roast(product);
  const unit =
    product.category === "Subscriptions" ? "/ delivery" : product.category === "Coffee" ? `/ ${product.variants[0]?.label.replace(" bag", "") ?? "bag"}` : "";
  return (
    <Link href={href.product(product)} className={cn("group block", className)}>
      <div className="relative aspect-[4/5] overflow-hidden rounded-[4px] bg-rl-sand">
        <ProductImage
          product={product}
          sizes={sizes}
          className="transition-transform duration-700 ease-out group-hover:scale-[1.03]"
        />
        {(product.new || product.bestseller) && (
          <span className="absolute left-3 top-3 rounded-[3px] bg-rl-cream px-2 py-1 text-xs font-semibold text-rl-ink">
            {product.new ? "New" : "Bestseller"}
          </span>
        )}
      </div>
      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="rl-serif text-[19px] leading-snug text-rl-ink group-hover:text-rl-rust transition-colors">
            {product.name}
          </h3>
          <p className="mt-1 text-sm text-rl-mute">
            {tasting ?? product.attributes.style.map(styleLabel).join(", ")}
            {roastLevel ? ` (${roastLevel} roast)` : ""}
          </p>
        </div>
        <p className="shrink-0 text-right text-[15px] font-semibold tabular-nums">
          {money(product.price)}
          {unit && <span className="block text-xs font-normal text-rl-mute">{unit}</span>}
        </p>
      </div>
    </Link>
  );
}

import type { Product } from "@slice/demo-catalogs";
import { cn } from "cn";
import { swatch } from "@/lib/swatches";

// Product photo, or until photos are fetched, a swing-tag placeholder: the
// brand in italic didone over a strip of the product's own colors.
export function ProductImage({
  product,
  className,
  priority,
  sizes = "(min-width: 1024px) 25vw, 50vw",
  position,
}: {
  product: Product;
  className?: string;
  priority?: boolean;
  sizes?: string;
  /** object-position, for detail crops of the same photo. */
  position?: string;
}) {
  const src = product.images[0];
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={`${product.brand ?? ""} ${product.name}`.trim()}
        sizes={sizes}
        loading={priority ? "eager" : "lazy"}
        style={position ? { objectPosition: position } : undefined}
        className={cn("h-full w-full object-cover", className)}
      />
    );
  }

  const colors = product.attributes.colors.slice(0, 4).map(swatch);
  return (
    <div
      role="img"
      aria-label={product.name}
      className={cn("relative flex h-full w-full flex-col bg-night-3", className)}
    >
      <span className="tag absolute left-4 top-4 text-fog">{product.subcategory}</span>
      <span className="didone m-auto px-6 text-center text-3xl italic text-bone/80">
        {product.brand}
      </span>
      <span className="flex h-[22%]">
        {colors.map((c, i) => (
          <span key={i} className="flex-1" style={{ background: c }} />
        ))}
      </span>
    </div>
  );
}

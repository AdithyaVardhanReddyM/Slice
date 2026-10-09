import type { Product } from "@slice/demo-catalogs";
import { cn } from "cn";
import { swatch } from "@/lib/swatches";

// Product photo, or a neutral placeholder in the product's own colours.
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
  return (
    <div
      role="img"
      aria-label={product.name}
      className={cn("flex h-full w-full items-center justify-center bg-fd-mist", className)}
    >
      <span className="flex gap-1.5">
        {product.attributes.colors.slice(0, 3).map((c) => (
          <span key={c} className="size-4 rounded-full ring-1 ring-black/10" style={{ background: swatch(c) }} />
        ))}
      </span>
    </div>
  );
}

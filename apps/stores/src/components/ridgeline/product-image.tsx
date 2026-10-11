import type { Product } from "@slice/demo-catalogs";
import { cn } from "cn";

export function ProductImage({
  product,
  className,
  priority,
  sizes = "(min-width: 1024px) 25vw, 50vw",
  position,
  alt,
}: {
  product: Product;
  className?: string;
  priority?: boolean;
  sizes?: string;
  position?: string;
  alt?: string;
}) {
  const src = product.images[0];
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt ?? product.name}
        sizes={sizes}
        loading={priority ? "eager" : "lazy"}
        style={position ? { objectPosition: position } : undefined}
        className={cn("h-full w-full object-cover", className)}
      />
    );
  }
  return (
    <div role="img" aria-label={product.name} className={cn("h-full w-full bg-rl-sand", className)} />
  );
}

/** A hero or editorial photo from the Scenes category. */
export function Scene({
  src,
  alt,
  className,
  priority,
  position,
}: {
  src?: string;
  alt: string;
  className?: string;
  priority?: boolean;
  position?: string;
}) {
  if (!src) return <div aria-hidden className={cn("h-full w-full bg-rl-sand", className)} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      style={position ? { objectPosition: position } : undefined}
      className={cn("h-full w-full object-cover", className)}
    />
  );
}

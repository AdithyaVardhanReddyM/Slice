import type { Product } from "@slice/demo-catalogs";
import { cn } from "cn";

export function Photo({
  src,
  alt,
  className,
  priority,
  position,
  sizes,
}: {
  src?: string;
  alt: string;
  className?: string;
  priority?: boolean;
  position?: string;
  sizes?: string;
}) {
  if (!src) return <div role="img" aria-label={alt} className={cn("h-full w-full bg-sl-stone", className)} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      sizes={sizes}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      style={position ? { objectPosition: position } : undefined}
      className={cn("h-full w-full object-cover", className)}
    />
  );
}

export function ProductPhoto({ product, ...rest }: { product: Product } & Omit<Parameters<typeof Photo>[0], "src" | "alt">) {
  return <Photo src={product.images[0]} alt={product.name} {...rest} />;
}

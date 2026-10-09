import type { Product } from "@slice/demo-catalogs";
import { cn } from "cn";
import { isLight, swatch } from "@/lib/swatches";

// Until photos are fetched, a product renders as a flat color field with one
// geometric form in its secondary color, so catalog pages still read as a
// designed grid rather than a wall of grey boxes.
export function ProductImage({
  product,
  index = 0,
  className,
  priority,
  sizes = "(min-width: 1024px) 25vw, 50vw",
}: {
  product: Product;
  index?: number;
  className?: string;
  priority?: boolean;
  sizes?: string;
}) {
  const src = product.images[index];
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={product.name}
        sizes={sizes}
        loading={priority ? "eager" : "lazy"}
        className={cn("h-full w-full object-cover", className)}
      />
    );
  }

  const colors = product.attributes.colors.map(swatch);
  const base = colors[(index + 1) % colors.length] ?? "#e4e1d9";
  const form = colors[index % colors.length] ?? "#121212";
  const dark = !isLight(base);
  const shape = hash(product.id + index) % 4;

  return (
    <div
      role="img"
      aria-label={product.name}
      className={cn("relative h-full w-full overflow-hidden", className)}
      style={{ background: base }}
    >
      <svg viewBox="0 0 100 125" className="absolute inset-0 h-full w-full" aria-hidden>
        {shape === 0 && <circle cx="50" cy="66" r="30" fill={form} />}
        {shape === 1 && <rect x="22" y="30" width="56" height="70" rx="3" fill={form} />}
        {shape === 2 && <path d="M20 95 L50 30 L80 95 Z" fill={form} />}
        {shape === 3 && (
          <path d="M20 40 h60 v30 a30 30 0 0 1 -60 0 z" fill={form} />
        )}
      </svg>
      <span
        className={cn(
          "mono absolute left-3 top-3 max-w-[calc(100%-1.5rem)] truncate",
          dark ? "text-chalk/70" : "text-ink/60",
        )}
      >
        {product.subcategory}
      </span>
    </div>
  );
}

function hash(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

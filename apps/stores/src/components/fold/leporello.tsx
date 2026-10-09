import Link from "next/link";
import type { Product } from "@slice/demo-catalogs";
import { href, styleLabel } from "@/lib/fold";
import { ProductImage } from "./product-image";

// The hero: a fold-out lookbook. Five photos printed on one strip of paper
// that's been accordion-folded; hovering opens it flat.
export function Leporello({ panels }: { panels: { product: Product; style: string }[] }) {
  return (
    <div className="leporello flex h-[62vh] min-h-[420px] py-[3vw] sm:h-[78vh]">
      {panels.map(({ product, style }, i) => (
        <Link
          key={product.id}
          href={href.edit(style)}
          className="unfold-in group relative flex-1 overflow-hidden bg-night-3 max-sm:[&:nth-child(n+4)]:hidden"
          style={{ animationDuration: `${1.1 + i * 0.12}s` }}
        >
          <ProductImage product={product} priority sizes="(min-width: 640px) 20vw, 33vw" />
          <span className="shade pointer-events-none absolute inset-0" />
          <span className="tag absolute bottom-4 left-4 text-bone opacity-0 transition-opacity duration-500 group-hover:opacity-100">
            {styleLabel(style)} →
          </span>
        </Link>
      ))}
    </div>
  );
}

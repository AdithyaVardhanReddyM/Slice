"use client";

import Link from "next/link";
import { useState } from "react";
import type { Product } from "@slice/demo-catalogs";
import { cn } from "cn";
import { href } from "@/lib/fold";
import { ProductImage } from "./product-image";

export interface BrandRow {
  name: string;
  slug: string;
  origin: string;
  count: number;
  cover?: Product;
}

// Typographic A–Z of labels. Hovering a row floats one of its pieces next to
// the cursor, so the list stays dense but you still see what each label makes.
export function BrandIndex({ brands, size = "lg" }: { brands: BrandRow[]; size?: "lg" | "md" }) {
  const [hover, setHover] = useState<{ slug: string; x: number; y: number } | null>(null);
  const current = brands.find((b) => b.slug === hover?.slug);

  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      <ul>
        {brands.map((b, i) => {
          const letter = b.name[0].toUpperCase();
          const showLetter = i === 0 || brands[i - 1].name[0].toUpperCase() !== letter;
          return (
            <li key={b.slug} className="border-t border-seam last:border-b">
              <Link
                href={href.brand(b.slug)}
                onMouseMove={(e) => setHover({ slug: b.slug, x: e.clientX, y: e.clientY })}
                className="group grid grid-cols-[2.5rem_1fr_auto] items-baseline gap-3 py-3 sm:grid-cols-[4rem_1fr_14rem_5rem] sm:py-4"
              >
                <span className="tag text-fog">{showLetter ? letter : ""}</span>
                <span
                  className={cn(
                    "didone transition-[color,transform] duration-500 ease-fold group-hover:translate-x-3 group-hover:italic group-hover:text-signal",
                    size === "lg" ? "text-4xl sm:text-6xl" : "text-3xl sm:text-4xl",
                  )}
                >
                  {b.name}
                </span>
                <span className="hidden text-sm text-fog sm:block">{b.origin}</span>
                <span className="tag text-right text-fog">{b.count} pcs</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {current?.cover && hover && (
        <div
          className="pointer-events-none fixed z-30 hidden w-52 rotate-3 shadow-2xl shadow-black/60 lg:block"
          style={{ left: hover.x + 28, top: hover.y - 140 }}
          aria-hidden
        >
          <div className="aspect-[3/4] overflow-hidden bg-night-3">
            <ProductImage product={current.cover} sizes="208px" />
          </div>
          <p className="tag bg-bone px-3 py-2 text-night">{current.cover.name}</p>
        </div>
      )}
    </div>
  );
}

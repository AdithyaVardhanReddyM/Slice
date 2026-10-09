"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { fold, href } from "@/lib/fold";
import { useWishlist } from "@/lib/wishlist";
import { ProductCard } from "@/components/fold/product-card";

export default function SavedPage() {
  const { ids } = useWishlist("fold:wishlist");
  const items = ids.map((id) => fold.products.find((p) => p.id === id)).filter((p) => p !== undefined);

  return (
    <main className="fd-container pt-10">
      <h1 className="text-3xl font-semibold tracking-[-0.02em] sm:text-[40px]">Wishlist</h1>
      <p className="mt-2 text-[15px] text-fd-mute">
        {items.length} saved {items.length === 1 ? "item" : "items"}
      </p>
      {items.length === 0 ? (
        <div className="py-24 text-center">
          <Heart className="mx-auto size-10 text-fd-mute" strokeWidth={1.2} />
          <p className="mt-4 text-lg font-semibold">Nothing saved yet</p>
          <p className="mt-1 text-sm text-fd-mute">Tap the heart on any product to keep it here.</p>
          <Link href={href.newIn} className="mt-6 inline-block rounded-full bg-fd-ink px-6 py-3 text-sm font-semibold text-white hover:bg-fd-forest">
            Shop new in
          </Link>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-10 pt-8 md:grid-cols-3 lg:gap-x-6 xl:grid-cols-4">
          {items.map((p) => (
            <li key={p.id}>
              <ProductCard product={p} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

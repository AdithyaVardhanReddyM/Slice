import type { Metadata } from "next";
import Script from "next/script";
import { CartProvider } from "@/lib/cart";
import { marlow } from "@/lib/catalog";
import { CartDrawer } from "@/components/marlow/cart-drawer";
import { Footer } from "@/components/marlow/footer";
import { Header } from "@/components/marlow/header";

export const metadata: Metadata = {
  title: { default: "Marlow", template: "%s · Marlow" },
  description: marlow.store.tagline,
};

const SLICE_SCRIPT =
  process.env.NEXT_PUBLIC_SLICE_SCRIPT_URL ?? "http://localhost:5173/src/index.ts";

export default function MarlowLayout({ children }: LayoutProps<"/marlow">) {
  return (
    <CartProvider storageKey="marlow:cart">
      <Header store={marlow.store} />
      <div className="flex-1">{children}</div>
      <Footer store={marlow.store} />
      <CartDrawer />
      {/* What a merchant pastes. `type="module"` only because the dev widget is served unbundled by vite. */}
      <Script
        src={SLICE_SCRIPT}
        type="module"
        strategy="afterInteractive"
        data-slice-key="marlow"
      />
    </CartProvider>
  );
}

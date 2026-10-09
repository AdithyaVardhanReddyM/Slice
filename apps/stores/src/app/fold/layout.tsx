import type { Metadata } from "next";
import { Instrument_Sans } from "next/font/google";
import Script from "next/script";
import { CartProvider } from "@/lib/cart";
import { fold } from "@/lib/fold";
import { CartDrawer } from "@/components/fold/cart-drawer";
import { Footer } from "@/components/fold/footer";
import { Header, type MenuGroup } from "@/components/fold/header";

const instrument = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: { default: "Fold — Clothing, footwear & accessories from 24 brands", template: "%s · Fold" },
  description: fold.store.tagline,
};

const SLICE_SCRIPT =
  process.env.NEXT_PUBLIC_SLICE_SCRIPT_URL ?? "http://localhost:5173/src/index.ts";

// Mega-menu data is built here on the server so the client header doesn't
// ship the whole catalog.
const groups: MenuGroup[] = fold.store.nav.map((g) => {
  const items = fold.inCategory(g.category).filter((p) => p.images.length);
  const names = new Set(items.map((p) => p.brand));
  const features = [...items.filter((p) => p.bestseller || p.new), ...items].filter(
    (p, i, all) => all.indexOf(p) === i,
  );
  return {
    ...g,
    brands: (fold.store.brands ?? []).filter((b) => names.has(b.name)).map(({ name, slug }) => ({ name, slug })),
    features: features.slice(0, 2),
  };
});

export default function FoldLayout({ children }: LayoutProps<"/fold">) {
  return (
    <div className={`${instrument.variable} fold-root flex min-h-full flex-1 flex-col antialiased`}>
      <CartProvider storageKey="fold:cart">
        <Header groups={groups} />
        <div className="flex-1">{children}</div>
        <Footer store={fold.store} />
        <CartDrawer />
        {/* What a merchant pastes. `type="module"` only because the dev widget is served unbundled by vite. */}
        <Script src={SLICE_SCRIPT} type="module" strategy="afterInteractive" data-slice-key="fold" />
      </CartProvider>
    </div>
  );
}

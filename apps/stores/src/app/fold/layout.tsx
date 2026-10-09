import type { Metadata } from "next";
import { Bodoni_Moda, Familjen_Grotesk } from "next/font/google";
import Script from "next/script";
import { CartProvider } from "@/lib/cart";
import { fold } from "@/lib/fold";
import { CartDrawer } from "@/components/fold/cart-drawer";
import { Footer } from "@/components/fold/footer";
import { Header, type MenuGroup } from "@/components/fold/header";

const bodoni = Bodoni_Moda({
  variable: "--font-bodoni",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
});

const familjen = Familjen_Grotesk({
  variable: "--font-familjen",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Fold", template: "%s · Fold" },
  description: fold.store.tagline,
};

const SLICE_SCRIPT =
  process.env.NEXT_PUBLIC_SLICE_SCRIPT_URL ?? "http://localhost:5173/src/index.ts";

// Mega-menu data is built here on the server so the client header doesn't
// ship the whole catalog.
const groups: MenuGroup[] = fold.store.nav.map((g) => {
  const items = fold.inCategory(g.category);
  const names = new Set(items.map((p) => p.brand));
  return {
    ...g,
    brands: (fold.store.brands ?? []).filter((b) => names.has(b.name)).map(({ name, slug }) => ({ name, slug })),
    feature: items.find((p) => p.bestseller && p.images.length) ?? items.find((p) => p.images.length) ?? items[0],
  };
});

export default function FoldLayout({ children }: LayoutProps<"/fold">) {
  return (
    <div className={`${bodoni.variable} ${familjen.variable} fold-root flex min-h-full flex-1 flex-col`}>
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

import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { CartProvider } from "@/lib/cart";
import { ridgeline, sceneSrc } from "@/lib/ridgeline";
import { BagDrawer } from "@/components/ridgeline/bag-drawer";
import { Footer } from "@/components/ridgeline/footer";
import { Header } from "@/components/ridgeline/header";

const SITE = "http://localhost:3002";

export const metadata: Metadata = {
  title: { default: "Ridgeline Coffee Roasters", template: "%s – Ridgeline Coffee Roasters" },
  description: ridgeline.store.description,
  openGraph: {
    siteName: "Ridgeline Coffee Roasters",
    title: "Ridgeline Coffee Roasters",
    description: ridgeline.store.tagline,
    type: "website",
    url: `${SITE}/ridgeline`,
    images: [{ url: `${SITE}${sceneSrc("scene-home-hero") ?? "/ridgeline/logo.svg"}`, alt: "The Alberta Street café bar" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#f6f1e8",
};

// Google Fonts via a plain <link>, the way a real theme loads them, so the
// family names stay visible in the HTML (next/font would rename them).
const GOOGLE_FONTS =
  "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT,WONK@0,9..144,300..700,0..100,0..1;1,9..144,300..700,0..100,0..1&family=Manrope:wght@400..800&display=swap";

const SLICE_SCRIPT = process.env.NEXT_PUBLIC_SLICE_SCRIPT_URL ?? "http://localhost:5173/src/index.ts";

export default function RidgelineLayout({ children }: LayoutProps<"/ridgeline">) {
  return (
    <div className="ridgeline-root flex min-h-full flex-1 flex-col">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href={GOOGLE_FONTS} precedence="default" />
      <CartProvider storageKey="ridgeline:cart">
        <Header />
        <div className="flex-1">{children}</div>
        <Footer />
        <BagDrawer />
        {/* What a merchant pastes. `type="module"` only because the dev widget is served unbundled by vite. */}
        <Script src={SLICE_SCRIPT} type="module" strategy="afterInteractive" data-slice-key="ridgeline" />
      </CartProvider>
    </div>
  );
}

import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { saltline, sceneSrc } from "@/lib/saltline";
import { Footer } from "@/components/saltline/footer";
import { Header } from "@/components/saltline/header";

const SITE = "http://localhost:3002";

export const metadata: Metadata = {
  title: { default: "Saltline Hotels", template: "%s · Saltline Hotels" },
  description: saltline.store.description,
  openGraph: {
    siteName: "Saltline Hotels",
    title: "Saltline Hotels",
    description: saltline.store.tagline,
    type: "website",
    url: `${SITE}/saltline`,
    images: [{ url: `${SITE}${sceneSrc("scene-home-hero") ?? "/saltline/logo.svg"}`, alt: "A Saltline room in morning light" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#f7f5f0",
};

// Google Fonts via a plain <link>, the way a real hotel site loads them, so the
// family names stay visible in the HTML.
const GOOGLE_FONTS =
  "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Figtree:wght@300..700&display=swap";

const SLICE_SCRIPT = process.env.NEXT_PUBLIC_SLICE_SCRIPT_URL ?? "http://localhost:5173/src/index.ts";

export default function SaltlineLayout({ children }: LayoutProps<"/saltline">) {
  return (
    <div className="saltline-root flex min-h-full flex-1 flex-col">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href={GOOGLE_FONTS} precedence="default" />
      <Header />
      <div className="flex-1">{children}</div>
      <Footer />
      {/* What a merchant pastes. `type="module"` only because the dev widget is served unbundled by vite. */}
      <Script src={SLICE_SCRIPT} type="module" strategy="afterInteractive" data-slice-key="saltline" />
    </div>
  );
}

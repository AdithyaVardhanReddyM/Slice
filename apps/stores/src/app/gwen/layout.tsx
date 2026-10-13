import type { Metadata, Viewport } from "next";
import { card, gwen, sceneSrc } from "@/lib/gwen";
import { Footer } from "@/components/gwen/footer";
import { Header } from "@/components/gwen/header";
import { GoldDefs } from "@/components/gwen/logo";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: { default: "Gwen Reserve: the card for the table, the trip and the encore", template: "%s · Gwen" },
  description: gwen.store.tagline,
  icons: { icon: "/gwen/logo.svg" },
  openGraph: {
    siteName: "Gwen",
    title: card.name,
    description: gwen.store.tagline,
    type: "website",
    url: `${SITE}/gwen`,
    images: [{ url: `${SITE}${sceneSrc("scene-sky") ?? "/gwen/logo.svg"}`, alt: "Dawn sky" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#f7f6f2",
};

// Google Fonts via a plain <link>, the way a real marketing site loads them, so
// the family names stay visible in the HTML.
const GOOGLE_FONTS =
  "https://fonts.googleapis.com/css2?family=Funnel+Display:wght@400..800&family=Funnel+Sans:ital,wght@0,300..800;1,300..800&family=Instrument+Serif:ital@0;1&display=swap";

export default function GwenLayout({ children }: LayoutProps<"/gwen">) {
  return (
    <div className="gwen-root flex min-h-full flex-1 flex-col">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href={GOOGLE_FONTS} precedence="default" />
      <GoldDefs />
      <Header />
      <div className="flex-1">{children}</div>
      <Footer />
    </div>
  );
}

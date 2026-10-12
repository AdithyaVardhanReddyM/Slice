import type { Metadata, Viewport } from "next";
import { festival, sceneSrc, tagide } from "@/lib/tagide";
import { Footer } from "@/components/tagide/footer";
import { Header } from "@/components/tagide/header";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: { default: "Tágide Festival", template: "%s · Tágide Festival" },
  description: tagide.store.description,
  openGraph: {
    siteName: "Tágide Festival",
    title: `Tágide Festival, ${festival.dates}`,
    description: tagide.store.tagline,
    type: "website",
    url: `${SITE}/tagide`,
    images: [{ url: `${SITE}${sceneSrc("scene-hero-1") ?? "/tagide/logo.svg"}`, alt: "The Tejo stage at night" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#f4eee2",
};

// Google Fonts via a plain <link>, the way a real festival site loads them, so
// the family names stay visible in the HTML.
const GOOGLE_FONTS = "https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@125,800;125,900&family=Manrope:wght@400;500;600;700;800&display=swap";

export default function TagideLayout({ children }: LayoutProps<"/tagide">) {
  return (
    <div className="tagide-root flex min-h-full flex-1 flex-col">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href={GOOGLE_FONTS} precedence="default" />
      <Header />
      <div className="flex-1">{children}</div>
      <Footer />
    </div>
  );
}

import type { Metadata, Viewport } from "next";
import { COVERS_APP, COVERS_RESTAURANTS, photo, restaurantBySlug } from "@/lib/covers/site";
import { Footer } from "@/components/covers/footer";
import { Header } from "@/components/covers/header";
import { SITE } from "@/lib/site";
import "./covers.css";

const description = `Covers is the booking app for ${COVERS_RESTAURANTS.length} London restaurants worth crossing town for, from Soho counter seats to Mayfair dining rooms. Find a time, book in two taps, and read what our editors would order.`;
const ogPhoto = restaurantBySlug("clos-maggiore")!;

export const metadata: Metadata = {
  title: { default: `Covers: ${COVERS_APP.tagline.replace(/\.$/, "")}`, template: "%s – Covers" },
  description,
  icons: { icon: "/covers/mark.png", apple: "/covers/mark.png" },
  openGraph: {
    siteName: COVERS_APP.name,
    title: `Covers: ${COVERS_APP.tagline}`,
    description,
    type: "website",
    locale: "en_GB",
    url: `${SITE}/covers`,
    images: [{ url: photo(ogPhoto, 1200), alt: ogPhoto.photo.alt }],
  },
};

export const viewport: Viewport = {
  themeColor: "#fbf6ee",
};

// Google Fonts via a plain <link>, the way a real product site loads them, so
// the family names stay visible in the HTML.
const GOOGLE_FONTS = "https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@600;700&family=Inter:wght@400;500;600&display=swap";

export default function CoversLayout({ children }: LayoutProps<"/covers">) {
  return (
    <div className="covers-root flex min-h-full flex-1 flex-col">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href={GOOGLE_FONTS} precedence="default" />
      <Header />
      <div className="flex-1">{children}</div>
      <Footer />
    </div>
  );
}

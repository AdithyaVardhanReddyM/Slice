import type { Metadata, Viewport } from "next";
import { FOLIO_SHOP } from "@/lib/folio/shop";
import { BagProvider } from "@/components/folio/bag";
import { Footer } from "@/components/folio/footer";
import { Header } from "@/components/folio/header";
import { SITE } from "@/lib/site";
import "./folio.css";

const description =
  "Folio & Fern is an independent bookshop on Court Street in Carroll Gardens, Brooklyn: new books, handwritten staff picks, a monthly book club, author events and Saturday Story Hour.";

export const metadata: Metadata = {
  title: { default: "Folio & Fern · Independent bookshop in Carroll Gardens, Brooklyn", template: "%s · Folio & Fern" },
  description,
  icons: { icon: "/folio/mark.svg", apple: "/folio/mark.png" },
  openGraph: {
    siteName: FOLIO_SHOP.name,
    title: "Folio & Fern, Brooklyn",
    description,
    type: "website",
    url: `${SITE}/folio`,
    images: [{ url: `${SITE}/folio/photos/shop-reading.jpg`, alt: "Inside Folio & Fern" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#f6f1e7",
};

// Google Fonts via a plain <link>, the way a real shop site loads them, so the
// family names stay visible in the HTML.
const GOOGLE_FONTS = "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..700&family=Source+Sans+3:ital,wght@0,400..700;1,400..700&display=swap";

export default function FolioLayout({ children }: LayoutProps<"/folio">) {
  return (
    <div className="folio-root flex min-h-full flex-1 flex-col">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href={GOOGLE_FONTS} precedence="default" />
      <BagProvider>
        <Header />
        <div className="flex-1">{children}</div>
        <Footer />
      </BagProvider>
    </div>
  );
}

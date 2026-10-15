import type { Metadata, Viewport } from "next";
import { FOLIO_SHOP } from "@/lib/stackhouse/shop";
import { BagProvider } from "@/components/stackhouse/bag";
import { Footer } from "@/components/stackhouse/footer";
import { Header } from "@/components/stackhouse/header";
import { SITE } from "@/lib/site";
import "./stackhouse.css";

const description =
  "Stackhouse Books is an independent bookshop on Court Street in Carroll Gardens, Brooklyn: new books, handwritten staff picks, a monthly book club, author events and Saturday Story Hour.";

export const metadata: Metadata = {
  title: { default: "Stackhouse Books · Independent bookshop in Carroll Gardens, Brooklyn", template: "%s · Stackhouse Books" },
  description,
  icons: { icon: "/stackhouse/mark.svg", apple: "/stackhouse/mark.png" },
  openGraph: {
    siteName: FOLIO_SHOP.name,
    title: "Stackhouse Books, Brooklyn",
    description,
    type: "website",
    url: `${SITE}/stackhouse`,
    images: [{ url: `${SITE}/stackhouse/photos/shop-reading.jpg`, alt: "Inside Stackhouse Books" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#f6f1e7",
};

// Google Fonts via a plain <link>, the way a real shop site loads them, so the
// family names stay visible in the HTML.
const GOOGLE_FONTS = "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..700&family=Source+Sans+3:ital,wght@0,400..700;1,400..700&display=swap";

export default function FolioLayout({ children }: LayoutProps<"/stackhouse">) {
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

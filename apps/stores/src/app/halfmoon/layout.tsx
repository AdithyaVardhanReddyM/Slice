import type { Metadata, Viewport } from "next";
import { COFFEES, HALFMOON } from "@/lib/halfmoon/site";
import { Footer } from "@/components/halfmoon/footer";
import { SITE } from "@/lib/site";
import "./halfmoon.css";

const description = `Small-batch coffee roasted in ${HALFMOON.city}, California and shipped within 48 hours: ${COFFEES.map((c) => `${c.name} (${c.kind.toLowerCase()})`).join(", ")}. Subscribe with Moon Club for 15% off.`;

export const metadata: Metadata = {
  title: { default: `${HALFMOON.name}: ${HALFMOON.tagline.replace(/\.$/, "")}`, template: `%s – ${HALFMOON.name}` },
  description,
  icons: { icon: "/halfmoon/mark.png", apple: "/halfmoon/mark.png" },
  openGraph: {
    siteName: HALFMOON.name,
    title: `${HALFMOON.name}: ${HALFMOON.tagline}`,
    description,
    type: "website",
    locale: "en_US",
    url: `${SITE}/halfmoon`,
    images: [{ url: `${SITE}/halfmoon/img/og.jpg`, alt: "Half Moon coffee bags against a blue sky" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#3da8f2",
};

// Google Fonts via a plain <link>, the way a real product site loads them, so
// the family names stay visible in the HTML.
const GOOGLE_FONTS = "https://fonts.googleapis.com/css2?family=Inter+Tight:wght@500;600;700&family=Inter:wght@400;500;600&display=swap";

export default function HalfMoonLayout({ children }: LayoutProps<"/halfmoon">) {
  return (
    <div className="halfmoon-root flex min-h-full flex-1 flex-col overflow-x-clip">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href={GOOGLE_FONTS} precedence="default" />
      <div className="flex-1">{children}</div>
      <Footer />
    </div>
  );
}

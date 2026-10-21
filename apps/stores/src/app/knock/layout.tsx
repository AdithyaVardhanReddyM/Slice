import type { Metadata, Viewport } from "next";
import { KNOCK, RESTAURANTS } from "@/lib/knock/site";
import { Footer } from "@/components/knock/footer";
import { SITE } from "@/lib/site";
import "./knock.css";

const description = `Knock delivers from ${KNOCK.stats.kitchens}+ of Los Angeles' favourite independent kitchens, from birria in East LA to tsukemen on Sawtelle, in about ${KNOCK.stats.minutes} minutes. Order from ${RESTAURANTS.slice(0, 4)
  .map((r) => r.name)
  .join(", ")} and more.`;

export const metadata: Metadata = {
  title: { default: `Knock: ${KNOCK.tagline.replace(/\.$/, "")}`, template: "%s – Knock" },
  description,
  icons: { icon: "/knock/mark.png", apple: "/knock/mark.png" },
  openGraph: {
    siteName: KNOCK.name,
    title: `Knock: ${KNOCK.tagline}`,
    description,
    type: "website",
    locale: "en_US",
    url: `${SITE}/knock`,
    images: [{ url: `${SITE}/knock/img/og.jpg`, alt: "A Knock courier on a red scooter" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#ffb627",
};

// Google Fonts via a plain <link>, the way a real product site loads them, so
// the family names stay visible in the HTML.
const GOOGLE_FONTS = "https://fonts.googleapis.com/css2?family=Archivo:ital,wght@0,800;0,900;1,900&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap";

export default function KnockLayout({ children }: LayoutProps<"/knock">) {
  return (
    <div className="knock-root flex min-h-full flex-1 flex-col overflow-x-clip">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href={GOOGLE_FONTS} precedence="default" />
      <div className="flex-1">{children}</div>
      <Footer />
    </div>
  );
}

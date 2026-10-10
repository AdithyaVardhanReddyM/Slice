import { DM_Sans } from "next/font/google";
import { ConvexPublicProvider } from "@/components/providers/convex-public-provider";
import "./concierge.css";

// DM Sans with its optical-size axis: warm and readable at 14px, with a bit of
// character at the greeting sizes. Scoped to the embed so the console keeps Inter.
const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  axes: ["opsz"],
});

// Everything under /embed renders inside the slice.js iframe on merchant sites:
// no Clerk here, and next.config.ts allows these routes to be framed.
export default function EmbedLayout({ children }: LayoutProps<"/embed">) {
  return (
    <div className={`${dmSans.variable} slice-embed`}>
      <ConvexPublicProvider>{children}</ConvexPublicProvider>
    </div>
  );
}

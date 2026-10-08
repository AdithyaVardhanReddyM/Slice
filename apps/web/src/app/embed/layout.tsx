import { ConvexPublicProvider } from "@/components/providers/convex-public-provider";

// Everything under /embed renders inside the slice.js iframe on merchant sites:
// no Clerk here, and next.config.ts allows these routes to be framed.
export default function EmbedLayout({ children }: LayoutProps<"/embed">) {
  return <ConvexPublicProvider>{children}</ConvexPublicProvider>;
}

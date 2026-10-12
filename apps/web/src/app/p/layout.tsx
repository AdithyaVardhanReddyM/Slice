import type { ReactNode } from "react";
import { ConvexPublicProvider } from "@/components/providers/convex-public-provider";

// Published landing pages: anonymous visitors, no Clerk.
export default function PublicPageLayout({ children }: { children: ReactNode }) {
  return <ConvexPublicProvider>{children}</ConvexPublicProvider>;
}

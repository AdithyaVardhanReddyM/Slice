import type { Metadata } from "next";
import { BrandOverview } from "@/components/console/pages/overview";

// Rendered only once the brand shell has resolved the brand, so this segment may block (see the layout).
export const instant = false;

export const metadata: Metadata = { title: "Overview" };

export default function BrandOverviewPage() {
  return <BrandOverview />;
}

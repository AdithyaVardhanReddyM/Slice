import type { Metadata } from "next";
import { Suspense } from "react";
import { BrandAnalytics } from "@/components/console/pages/brand-analytics";
import { PageSkeleton } from "@/components/console/primitives";

// Rendered only once the brand shell has resolved the brand, so this segment may block (see the layout).
export const instant = false;

export const metadata: Metadata = { title: "Analytics" };

export default function AnalyticsRoute() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <BrandAnalytics />
    </Suspense>
  );
}

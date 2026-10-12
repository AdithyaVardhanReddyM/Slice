import type { Metadata } from "next";
import { Suspense } from "react";
import { PageInsights } from "@/components/console/pages/insights/page-insights";
import { PageSkeleton } from "@/components/console/primitives";

// Rendered only once the brand shell has resolved the brand, so this segment may block (see the layout).
export const instant = false;

export const metadata: Metadata = { title: "Insights" };

export default function InsightsRoute() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PageInsights />
    </Suspense>
  );
}

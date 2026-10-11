import type { Metadata } from "next";
import { Suspense } from "react";
import { AudiencesScreen } from "@/components/console/pages/audiences";
import { PageSkeleton } from "@/components/console/primitives";

// Rendered only once the brand shell has resolved the brand, so this segment may block (see the layout).
export const instant = false;

export const metadata: Metadata = { title: "Audiences" };

export default function AudiencesRoute() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AudiencesScreen />
    </Suspense>
  );
}

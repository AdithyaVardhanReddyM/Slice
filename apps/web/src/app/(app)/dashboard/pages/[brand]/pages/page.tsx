import type { Metadata } from "next";
import { Suspense } from "react";
import { PagesScreen } from "@/components/console/pages/pages-list";
import { PageSkeleton } from "@/components/console/primitives";

// Rendered only once the brand shell has resolved the brand, so this segment may block (see the layout).
export const instant = false;

export const metadata: Metadata = { title: "Pages" };

export default function PagesRoute() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PagesScreen />
    </Suspense>
  );
}

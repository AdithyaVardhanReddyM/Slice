import type { Metadata } from "next";
import { Suspense } from "react";
import { PageBuilder } from "@/components/console/pages/builder/builder";
import { PageSkeleton } from "@/components/console/primitives";

// Rendered only once the brand shell has resolved the brand, so this segment may block (see the layout).
export const instant = false;

export const metadata: Metadata = { title: "Builder" };

export default function BuilderRoute() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PageBuilder />
    </Suspense>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { NewPageBuilder } from "@/components/console/pages/builder/new-page";
import { PageSkeleton } from "@/components/console/primitives";

// Rendered only once the brand shell has resolved the brand, so this segment may block (see the layout).
export const instant = false;

export const metadata: Metadata = { title: "New page" };

export default function NewPageRoute() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewPageBuilder />
    </Suspense>
  );
}

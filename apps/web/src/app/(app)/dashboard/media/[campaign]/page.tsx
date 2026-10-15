import type { Metadata } from "next";
import { Suspense } from "react";
import { MediaStudioRoute } from "@/components/console/media/studio/studio";

// The studio reads the campaign id and ?generate from the URL on the client.
export const instant = false;

export const metadata: Metadata = { title: "Media studio" };

export default function MediaStudioPage() {
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-white" />}>
      <MediaStudioRoute />
    </Suspense>
  );
}

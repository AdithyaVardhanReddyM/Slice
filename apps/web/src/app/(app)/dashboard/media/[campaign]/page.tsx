import type { Metadata } from "next";
import { Suspense } from "react";
import { MediaCanvasRoute } from "@/components/console/media/canvas/workspace";

// The canvas reads the campaign id from the URL on the client.
export const instant = false;

export const metadata: Metadata = { title: "Media" };

export default function MediaCampaignPage() {
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-[#f6f5f3]" />}>
      <MediaCanvasRoute />
    </Suspense>
  );
}

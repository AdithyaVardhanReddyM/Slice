import type { Metadata } from "next";
import { Suspense } from "react";
import { NewCampaign } from "@/components/console/media/campaign-list";

export const metadata: Metadata = { title: "New campaign" };

/** A new campaign opens straight on its canvas. */
export default function NewMediaCampaignPage() {
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-[#f6f5f3]" />}>
      <NewCampaign />
    </Suspense>
  );
}

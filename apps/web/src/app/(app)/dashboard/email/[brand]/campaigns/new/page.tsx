import type { Metadata } from "next";
import { Suspense } from "react";
import { NewCampaignScreen } from "@/components/console/email/campaigns/new-campaign";
import { PageSkeleton } from "@/components/console/primitives";

// Rendered only once the brand shell has resolved the brand, so this segment may block (see the layout).
export const instant = false;

export const metadata: Metadata = { title: "New campaign" };

export default function NewEmailCampaignRoute() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewCampaignScreen />
    </Suspense>
  );
}

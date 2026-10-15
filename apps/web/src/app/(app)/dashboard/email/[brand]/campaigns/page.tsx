import type { Metadata } from "next";
import { Suspense } from "react";
import { CampaignsScreen } from "@/components/console/email/campaigns/campaigns-screen";
import { PageSkeleton } from "@/components/console/primitives";

// Rendered only once the brand shell has resolved the brand, so this segment may block (see the layout).
export const instant = false;

export const metadata: Metadata = { title: "Campaigns" };

export default function EmailCampaignsRoute() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CampaignsScreen />
    </Suspense>
  );
}

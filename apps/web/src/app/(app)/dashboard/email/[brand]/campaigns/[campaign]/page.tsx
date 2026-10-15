import type { Metadata } from "next";
import { Suspense } from "react";
import { CampaignEditor } from "@/components/console/email/editor/campaign-shell";

// Rendered only once the brand shell has resolved the brand, so this segment may block (see the layout).
// The editor reads the campaign id and ?step from the URL on the client.
export const instant = false;

export const metadata: Metadata = { title: "Campaign" };

export default function CampaignEditorRoute() {
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-white" />}>
      <CampaignEditor />
    </Suspense>
  );
}

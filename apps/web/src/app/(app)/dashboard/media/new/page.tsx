import type { Metadata } from "next";
import { MediaCampaignList } from "@/components/console/media/campaign-list";
import { StandaloneShell } from "@/components/console/widgets/shell";

export const metadata: Metadata = { title: "New campaign" };

/** A new campaign asks which brand it is for first, over the campaign list. */
export default function NewMediaCampaignPage() {
  return (
    <StandaloneShell>
      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        <MediaCampaignList startOpen />
      </div>
    </StandaloneShell>
  );
}

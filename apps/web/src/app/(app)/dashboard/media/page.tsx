import type { Metadata } from "next";
import { MediaCampaignList } from "@/components/console/media/campaign-list";
import { StandaloneShell } from "@/components/console/widgets/shell";

export const metadata: Metadata = { title: "Media" };

/** The Media service's clients: one campaign per brief. */
export default function MediaPage() {
  return (
    <StandaloneShell>
      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        <MediaCampaignList />
      </div>
    </StandaloneShell>
  );
}

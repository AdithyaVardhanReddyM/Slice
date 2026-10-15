import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { X } from "lucide-react";
import { NewMediaCampaign } from "@/components/console/media/new-campaign";
import { PageSkeleton } from "@/components/console/primitives";
import { StandaloneShell } from "@/components/console/widgets/shell";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "New campaign" };

export default function NewMediaCampaignPage() {
  return (
    <StandaloneShell
      actions={
        <Link href="/dashboard/media" className={buttonVariants({ variant: "ghost" })}>
          <X data-icon="inline-start" /> Back to campaigns
        </Link>
      }
    >
      <div className="mx-auto w-full max-w-6xl px-6 py-6">
        <Suspense fallback={<PageSkeleton />}>
          <NewMediaCampaign />
        </Suspense>
      </div>
    </StandaloneShell>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { X } from "lucide-react";
import { NewBrandFlow } from "@/components/console/pages/new-brand-flow";
import { PageSkeleton } from "@/components/console/primitives";
import { StandaloneShell } from "@/components/console/widgets/shell";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "New brand" };

export default function NewBrandPage() {
  return (
    <StandaloneShell
      actions={
        <Link href="/dashboard/pages" className={buttonVariants({ variant: "ghost" })}>
          <X data-icon="inline-start" /> Back to brands
        </Link>
      }
    >
      <div className="mx-auto w-full max-w-6xl px-6 py-6">
        <Suspense fallback={<PageSkeleton />}>
          <NewBrandFlow />
        </Suspense>
      </div>
    </StandaloneShell>
  );
}

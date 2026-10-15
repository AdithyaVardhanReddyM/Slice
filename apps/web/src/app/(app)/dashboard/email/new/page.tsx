import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { X } from "lucide-react";
import { NewEmailBrandFlow } from "@/components/console/email/setup/new-brand-flow";
import { PageSkeleton } from "@/components/console/primitives";
import { StandaloneShell } from "@/components/console/widgets/shell";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "New brand" };

export default function NewEmailBrandPage() {
  return (
    <StandaloneShell
      actions={
        <Link href="/dashboard/email" className={buttonVariants({ variant: "ghost" })}>
          <X data-icon="inline-start" /> Back to brands
        </Link>
      }
    >
      <div className="mx-auto w-full max-w-[1320px] px-4 pt-8 pb-16 sm:px-6 lg:px-8">
        <Suspense fallback={<PageSkeleton />}>
          <NewEmailBrandFlow />
        </Suspense>
      </div>
    </StandaloneShell>
  );
}

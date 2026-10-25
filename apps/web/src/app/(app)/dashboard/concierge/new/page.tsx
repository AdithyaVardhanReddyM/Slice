import type { Metadata } from "next";
import Link from "next/link";
import { X } from "lucide-react";
import { NewWidgetFlow } from "@/components/console/widgets/new-widget-form";
import { StandaloneShell } from "@/components/console/widgets/shell";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "New widget" };

export default function NewWidgetPage() {
  return (
    <StandaloneShell
      actions={
        <Link
          href="/dashboard/concierge"
          className={buttonVariants({ variant: "ghost" })}
        >
          <X data-icon="inline-start" /> Back to widgets
        </Link>
      }
    >
      <div className="mx-auto w-full max-w-6xl px-6 py-6">
        <NewWidgetFlow />
      </div>
    </StandaloneShell>
  );
}

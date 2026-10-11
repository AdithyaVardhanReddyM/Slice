import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/console/primitives";
import { StandaloneShell } from "@/components/console/widgets/shell";
import { WidgetCard } from "@/components/console/widgets/widget-card";
import { WidgetsView } from "@/components/console/widgets/widgets-view";
import { buttonVariants } from "@/components/ui/button";
import { widgets } from "@/lib/mock/widgets";

export const metadata: Metadata = { title: "Concierge" };

/** The Concierge service's clients: one widget per storefront. */
export default function WidgetsPage() {
  return (
    <StandaloneShell>
      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        <Suspense>
          <WidgetsView hasWidgets={widgets.length > 0}>
            <PageHeader
              title="Concierge"
              description="Each widget is one storefront, with its own catalog, taste questions and install key."
              actions={
                <Link
                  href="/dashboard/concierge/new"
                  className={buttonVariants()}
                >
                  <Plus />
                  New widget
                </Link>
              }
            />
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {widgets.map((w) => (
                <WidgetCard key={w.id} widget={w} />
              ))}
            </div>
          </WidgetsView>
        </Suspense>
      </div>
    </StandaloneShell>
  );
}

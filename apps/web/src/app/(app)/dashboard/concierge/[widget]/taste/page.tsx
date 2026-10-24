import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState, PageSkeleton } from "@/components/console/primitives";
import { Tile } from "@/components/console/home/ui";
import { ConsolePage } from "@/components/console/shell-ui";
import {
  TasteHeader,
  TasteInsights,
} from "@/components/console/taste/taste-insights";
import { tasteMapGeometry } from "@/components/console/taste/map-geometry";
import { tasteInsights } from "@/lib/mock/taste-insights";
import { getWidget } from "@/lib/mock/widgets";

export const metadata: Metadata = { title: "Taste insights" };

export default function TastePage({
  params,
}: PageProps<"/dashboard/concierge/[widget]/taste">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TasteContent params={params} />
    </Suspense>
  );
}

async function TasteContent({
  params,
}: {
  params: PageProps<"/dashboard/concierge/[widget]/taste">["params"];
}) {
  const { widget: widgetId } = await params;
  const widget = getWidget(widgetId);
  if (!widget) notFound();

  const data = tasteInsights(widget);
  if (!data) {
    return (
      <ConsolePage>
        <TasteHeader widget={widget} meta={widget.domain} />
        <Tile className="mt-10">
          <EmptyState
            className="border-0 py-20"
            title="No shoppers yet"
            body="Once shoppers talk to the concierge, you'll see who they are, the styles they want and what to stock next."
            action={
              <Link
                href={`/dashboard/concierge/${widget.id}/${widget.status === "setup" ? "setup" : "install"}`}
                className={buttonVariants()}
              >
                {widget.status === "setup"
                  ? "Finish setup"
                  : "Install the widget"}
              </Link>
            }
          />
        </Tile>
      </ConsolePage>
    );
  }

  const geo = tasteMapGeometry(
    data.places,
    data.groups.map((g) => g.label),
  );
  return <TasteInsights widget={widget} data={data} geo={geo} />;
}

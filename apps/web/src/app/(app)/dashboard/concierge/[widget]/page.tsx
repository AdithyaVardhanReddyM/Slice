import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { WidgetOverview } from "@/components/console/overview/widget-overview";
import { PageSkeleton } from "@/components/console/primitives";
import { widgetOverview } from "@/lib/mock/widget-overview";
import { getWidget } from "@/lib/mock/widgets";

export const metadata: Metadata = { title: "Concierge" };

type Params = PageProps<"/dashboard/concierge/[widget]">["params"];

export default function OverviewPage({
  params,
}: PageProps<"/dashboard/concierge/[widget]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Overview params={params} />
    </Suspense>
  );
}

async function Overview({ params }: { params: Params }) {
  const { widget: widgetId } = await params;
  const widget = getWidget(widgetId);
  if (!widget) notFound();
  if (widget.status === "setup" || !widget.storeKey)
    redirect(`/dashboard/concierge/${widget.id}/setup`);
  return <WidgetOverview data={widgetOverview(widget)} />;
}

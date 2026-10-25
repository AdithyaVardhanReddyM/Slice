import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { LiveRefresh } from "@/components/console/live-refresh";
import { WidgetOverview } from "@/components/console/overview/widget-overview";
import { PageSkeleton } from "@/components/console/primitives";
import { liveData } from "@/lib/concierge/live";
import { liveOverview } from "@/lib/concierge/live-model";
import { showsSample } from "@/lib/concierge/sample";
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
  if (await showsSample())
    return <WidgetOverview data={widgetOverview(widget)} sample />;
  const data = await liveData(widget.storeKey);
  return (
    <>
      <LiveRefresh storeKey={widget.storeKey} />
      <WidgetOverview
        data={liveOverview(widget, data, Date.now())}
        sample={false}
      />
    </>
  );
}

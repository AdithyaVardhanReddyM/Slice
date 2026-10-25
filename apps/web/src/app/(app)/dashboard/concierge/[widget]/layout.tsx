import { Suspense } from "react";
import { redirect } from "next/navigation";
import { WidgetSidebar } from "@/components/console/sidebar";
import { Topbar } from "@/components/console/topbar";
import { insetClass } from "@/components/console/shell-ui";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { conversationsFor } from "@/lib/mock/conversations";
import { getWidget, widgets } from "@/lib/mock/widgets";
import { liveCount } from "@/lib/concierge/live";
import { removedWidgetIds } from "@/lib/concierge/removed-server";
import { showsSample } from "@/lib/concierge/sample";

export function generateStaticParams() {
  return widgets.map((s) => ({ widget: s.id }));
}

const conversationCounts = Object.fromEntries(
  widgets.map((w) => [w.id, conversationsFor(w.id).length]),
);

/** A deleted widget's console isn't there any more: back to the list. */
async function DeletedGuard({
  params,
}: {
  params: LayoutProps<"/dashboard/concierge/[widget]">["params"];
}) {
  const { widget } = await params;
  if ((await removedWidgetIds()).has(widget)) redirect("/dashboard/concierge");
  return null;
}

/** The sidebar's conversation count follows the sample switch. */
async function Sidebar({
  params,
}: {
  params: LayoutProps<"/dashboard/concierge/[widget]">["params"];
}) {
  const { widget: id } = await params;
  const storeKey = getWidget(id)?.storeKey;
  if ((await showsSample()) || !storeKey)
    return <WidgetSidebar conversationCounts={conversationCounts} />;
  return (
    <WidgetSidebar
      conversationCounts={{
        ...conversationCounts,
        [id]: await liveCount(storeKey),
      }}
    />
  );
}

export default function WidgetLayout({
  children,
  params,
}: LayoutProps<"/dashboard/concierge/[widget]">) {
  return (
    <SidebarProvider>
      <Suspense>
        <DeletedGuard params={params} />
      </Suspense>
      <Suspense fallback={<WidgetSidebar conversationCounts={{}} />}>
        <Sidebar params={params} />
      </Suspense>
      <SidebarInset className={insetClass}>
        <Topbar />
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

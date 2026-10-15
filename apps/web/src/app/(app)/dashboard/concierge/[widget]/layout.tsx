import { Suspense } from "react";
import { redirect } from "next/navigation";
import { WidgetSidebar } from "@/components/console/sidebar";
import { Topbar } from "@/components/console/topbar";
import { insetClass } from "@/components/console/shell-ui";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { conversationsFor } from "@/lib/mock/conversations";
import { widgets } from "@/lib/mock/widgets";
import { removedWidgetIds } from "@/lib/concierge/removed-server";

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

export default function WidgetLayout({
  children,
  params,
}: LayoutProps<"/dashboard/concierge/[widget]">) {
  return (
    <SidebarProvider>
      <Suspense>
        <DeletedGuard params={params} />
      </Suspense>
      <WidgetSidebar conversationCounts={conversationCounts} />
      <SidebarInset className={insetClass}>
        <Topbar />
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

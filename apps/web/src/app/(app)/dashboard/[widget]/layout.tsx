import { WidgetSidebar } from "@/components/console/sidebar";
import { Topbar } from "@/components/console/topbar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { conversationsFor } from "@/lib/mock/conversations";
import { widgets } from "@/lib/mock/widgets";

export function generateStaticParams() {
  return widgets.map((w) => ({ widget: w.id }));
}

const conversationCounts = Object.fromEntries(
  widgets.map((w) => [w.id, conversationsFor(w.id).length]),
);

export default function WidgetLayout({
  children,
}: LayoutProps<"/dashboard/[widget]">) {
  return (
    <SidebarProvider>
      <WidgetSidebar conversationCounts={conversationCounts} />
      <SidebarInset className="border md:peer-data-[variant=inset]:shadow-none">
        <Topbar />
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

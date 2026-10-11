import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ConversationList } from "@/components/console/conversations/conversation-list";
import { summarize } from "@/components/console/conversations/data";
import { conversationsFor } from "@/lib/mock/conversations";
import { getWidget } from "@/lib/mock/widgets";

export default function ConversationsLayout({
  children,
  params,
}: LayoutProps<"/dashboard/concierge/[widget]/conversations">) {
  // Fills the sheet below the 56px top bar; each pane scrolls on its own.
  return (
    <div className="flex h-[calc(100dvh-74px)] min-h-[560px]">
      <Suspense fallback={<div className="w-[340px] shrink-0 border-r" />}>
        <List params={params} />
      </Suspense>
      {children}
    </div>
  );
}

async function List({
  params,
}: {
  params: LayoutProps<"/dashboard/concierge/[widget]/conversations">["params"];
}) {
  const { widget: widgetId } = await params;
  const widget = getWidget(widgetId);
  if (!widget) notFound();
  const items = conversationsFor(widget.id).map(summarize);

  return (
    <ConversationList widgetId={widget.id} items={items} total={items.length} />
  );
}

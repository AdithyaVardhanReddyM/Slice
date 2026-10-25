import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ConversationList } from "@/components/console/conversations/conversation-list";
import { summarize } from "@/components/console/conversations/data";
import { LiveRefresh } from "@/components/console/live-refresh";
import { liveData } from "@/lib/concierge/live";
import { liveSummaries } from "@/lib/concierge/live-model";
import { showsSample } from "@/lib/concierge/sample";
import { conversationsFor } from "@/lib/mock/conversations";
import { getWidget } from "@/lib/mock/widgets";

export default function ConversationsLayout({
  children,
  params,
}: LayoutProps<"/dashboard/concierge/[widget]/conversations">) {
  // Fills the area below the 64px top bar as two white panes; each scrolls on its own.
  return (
    <div className="flex h-[calc(100dvh-82px)] min-h-[560px] gap-4 px-4 pt-2 pb-4 sm:px-6">
      <Suspense
        fallback={<div className="w-[340px] shrink-0 rounded-2xl bg-white" />}
      >
        <List params={params} />
      </Suspense>
      <div className="flex min-w-0 flex-1 overflow-hidden rounded-2xl bg-white ring-1 ring-black/[0.05] shadow-[0_1px_2px_rgba(20,20,20,0.04),0_10px_28px_-16px_rgba(20,20,20,0.10)]">
        {children}
      </div>
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
  if ((await showsSample()) || !widget.storeKey) {
    const items = conversationsFor(widget.id).map(summarize);
    return (
      <ConversationList
        widgetId={widget.id}
        items={items}
        total={items.length}
        sample
      />
    );
  }
  const items = liveSummaries(await liveData(widget.storeKey));
  return (
    <>
      <LiveRefresh storeKey={widget.storeKey} />
      <ConversationList
        widgetId={widget.id}
        items={items}
        total={items.length}
        now={Date.now()}
        sample={false}
      />
    </>
  );
}

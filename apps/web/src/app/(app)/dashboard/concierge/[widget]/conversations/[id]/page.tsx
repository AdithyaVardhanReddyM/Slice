import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConversationView } from "@/components/console/conversations/conversation-view";
import { conversationDetail } from "@/components/console/conversations/data";
import { Skeleton } from "@/components/console/primitives";
import { liveConversation } from "@/lib/concierge/live";
import { liveDetail } from "@/lib/concierge/live-model";
import { showsSample } from "@/lib/concierge/sample";
import { conversations, getConversation } from "@/lib/mock/conversations";
import { getWidget } from "@/lib/mock/widgets";

export function generateStaticParams() {
  return conversations.map((c) => ({ widget: c.widgetId, id: c.id }));
}

export async function generateMetadata({
  params,
}: PageProps<"/dashboard/concierge/[widget]/conversations/[id]">): Promise<Metadata> {
  const { id } = await params;
  const c = getConversation(id);
  return { title: c ? c.intent : "Conversation" };
}

type Params =
  PageProps<"/dashboard/concierge/[widget]/conversations/[id]">["params"];

export default function ConversationPage({
  params,
}: PageProps<"/dashboard/concierge/[widget]/conversations/[id]">) {
  return (
    <Suspense fallback={<ConversationSkeleton />}>
      <Conversation params={params} />
    </Suspense>
  );
}

async function Conversation({ params }: { params: Params }) {
  const { widget: widgetId, id } = await params;
  const widget = getWidget(widgetId);
  if (!widget) notFound();
  if ((await showsSample()) || !widget.storeKey) {
    const conversation = getConversation(id);
    if (!conversation || conversation.widgetId !== widget.id) notFound();
    return <ConversationView detail={conversationDetail(conversation)} />;
  }
  const found = await liveConversation(widget.storeKey, decodeURIComponent(id));
  if (!found) notFound();
  return <ConversationView detail={liveDetail(found)} />;
}

function ConversationSkeleton() {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="space-y-2 border-b px-6 py-4">
        <Skeleton className="h-6 w-72" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="mx-auto w-full max-w-3xl space-y-6 px-6 py-6">
        <Skeleton className="h-36 w-full rounded-2xl" />
        <Skeleton className="ml-auto h-12 w-2/3" />
        <Skeleton className="h-56 w-full" />
      </div>
    </div>
  );
}

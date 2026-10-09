import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConversationView } from "@/components/console/conversations/conversation-view";
import { productsFor } from "@/components/console/conversations/data";
import { Skeleton } from "@/components/console/primitives";
import { conversations, getConversation } from "@/lib/mock/conversations";
import { getWidget } from "@/lib/mock/widgets";

export function generateStaticParams() {
  return conversations.map((c) => ({ widget: c.widgetId, id: c.id }));
}

export async function generateMetadata({
  params,
}: PageProps<"/dashboard/[widget]/conversations/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: `Conversation ${id}` };
}

type Params = PageProps<"/dashboard/[widget]/conversations/[id]">["params"];

export default function ConversationPage({
  params,
}: PageProps<"/dashboard/[widget]/conversations/[id]">) {
  return (
    <Suspense fallback={<ConversationSkeleton />}>
      <Conversation params={params} />
    </Suspense>
  );
}

async function Conversation({ params }: { params: Params }) {
  const { widget: widgetId, id } = await params;
  const widget = getWidget(widgetId);
  const conversation = getConversation(id);
  if (!widget || !conversation || conversation.widgetId !== widget.id)
    notFound();

  return (
    <ConversationView
      conversation={conversation}
      products={productsFor(conversation)}
      conciergeName={`${widget.name} concierge`}
    />
  );
}

function ConversationSkeleton() {
  return (
    <div className="flex min-w-0 flex-1">
      <div className="flex-1 space-y-5 p-6">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="ml-auto h-14 w-2/3" />
        <Skeleton className="h-56 w-full" />
      </div>
      <div className="w-[400px] space-y-4 border-l p-5">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  );
}

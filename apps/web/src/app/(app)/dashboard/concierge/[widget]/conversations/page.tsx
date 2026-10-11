import type { Metadata } from "next";
import { MessagesSquare } from "lucide-react";

export const metadata: Metadata = { title: "Conversations" };

export default function ConversationsIndex() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="flex size-10 items-center justify-center rounded-lg border bg-muted">
        <MessagesSquare className="size-5 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <h2 className="text-base font-semibold">Select a conversation</h2>
        <p className="max-w-xs text-sm text-muted-foreground">
          See the full chat, the shopper&apos;s taste profile, and why each
          product was recommended.
        </p>
      </div>
    </div>
  );
}

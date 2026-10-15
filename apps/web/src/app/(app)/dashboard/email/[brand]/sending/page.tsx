import type { Metadata } from "next";
import { SendingPage } from "@/components/console/email/sending/sending-page";

// Rendered only once the brand shell has resolved the brand, so this segment may block (see the layout).
export const instant = false;

export const metadata: Metadata = { title: "Sending" };

export default function EmailSendingRoute() {
  return <SendingPage />;
}

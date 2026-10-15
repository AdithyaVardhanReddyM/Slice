import type { Metadata } from "next";
import { EmailKitPage } from "@/components/console/email/kit/kit-page";

// Rendered only once the brand shell has resolved the brand, so this segment may block (see the layout).
export const instant = false;

export const metadata: Metadata = { title: "Brand kit" };

export default function EmailKitRoute() {
  return <EmailKitPage />;
}

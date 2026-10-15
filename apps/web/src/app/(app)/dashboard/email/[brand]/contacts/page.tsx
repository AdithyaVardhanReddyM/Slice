import type { Metadata } from "next";
import { Suspense } from "react";
import { ContactsScreen } from "@/components/console/email/contacts/contacts-screen";
import { PageSkeleton } from "@/components/console/primitives";

// Rendered only once the brand shell has resolved the brand, so this segment may block (see the layout).
export const instant = false;

export const metadata: Metadata = { title: "Contacts" };

export default function EmailContactsRoute() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ContactsScreen />
    </Suspense>
  );
}

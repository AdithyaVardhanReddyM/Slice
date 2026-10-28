import { Suspense } from "react";
import { EmailBrandShell } from "@/components/console/email/brand-shell";

// The brand's screens are entirely data-driven (brand resolved from the slug
// on the client), so the segment is allowed to block instead of shipping a static shell.
export const instant = false;

export default function EmailBrandLayout({ children }: LayoutProps<"/dashboard/email/[brand]">) {
  // The shell reads the URL on the client, so the build's prerender needs a boundary to stop at.
  return (
    <Suspense>
      <EmailBrandShell>{children}</EmailBrandShell>
    </Suspense>
  );
}

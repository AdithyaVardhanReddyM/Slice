import { Suspense } from "react";
import { BrandShell } from "@/components/console/pages/brand-shell";

// The hub is entirely data-driven (brand resolved from the slug on the
// client), so it is allowed to block instead of shipping a static shell.
export const instant = false;

export default function BrandLayout({ children }: LayoutProps<"/dashboard/pages/[brand]">) {
  // The shell reads the URL on the client, so the build's prerender needs a boundary to stop at.
  return (
    <Suspense>
      <BrandShell>{children}</BrandShell>
    </Suspense>
  );
}

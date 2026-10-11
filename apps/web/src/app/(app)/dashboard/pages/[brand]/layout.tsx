import { BrandShell } from "@/components/console/pages/brand-shell";

// The hub is entirely data-driven (brand resolved from the slug on the
// client), so it is allowed to block instead of shipping a static shell.
export const instant = false;

export default function BrandLayout({ children }: LayoutProps<"/dashboard/pages/[brand]">) {
  return <BrandShell>{children}</BrandShell>;
}

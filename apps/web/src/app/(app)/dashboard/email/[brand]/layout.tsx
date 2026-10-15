import { EmailBrandShell } from "@/components/console/email/brand-shell";

// The brand's screens are entirely data-driven (brand resolved from the slug
// on the client), so the segment is allowed to block instead of shipping a static shell.
export const instant = false;

export default function EmailBrandLayout({ children }: LayoutProps<"/dashboard/email/[brand]">) {
  return <EmailBrandShell>{children}</EmailBrandShell>;
}

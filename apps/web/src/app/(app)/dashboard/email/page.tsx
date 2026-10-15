import type { Metadata } from "next";
import { EmailBrandList } from "@/components/console/email/brand-list";
import { StandaloneShell } from "@/components/console/widgets/shell";

export const metadata: Metadata = { title: "Email" };

/** The Email service's clients: one brand each, with its own kit, contacts and campaigns. */
export default function EmailPage() {
  return (
    <StandaloneShell>
      <div className="mx-auto w-full max-w-[1320px] px-4 pt-8 pb-16 sm:px-6 lg:px-8">
        <EmailBrandList />
      </div>
    </StandaloneShell>
  );
}

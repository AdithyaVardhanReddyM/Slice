import type { Metadata } from "next";
import { BrandList } from "@/components/console/pages/brand-list";
import { StandaloneShell } from "@/components/console/widgets/shell";

export const metadata: Metadata = { title: "Pages" };

/** The Pages service's clients: one brand per website. */
export default function PagesPage() {
  return (
    <StandaloneShell>
      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        <BrandList />
      </div>
    </StandaloneShell>
  );
}

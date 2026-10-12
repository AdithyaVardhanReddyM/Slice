import type { Metadata } from "next";
import { StandaloneShell } from "@/components/console/widgets/shell";
import { PagesHome } from "@/components/pages/console/pages-home";

export const metadata: Metadata = { title: "Pages" };

export default function PagesPage() {
  return (
    <StandaloneShell>
      <PagesHome />
    </StandaloneShell>
  );
}

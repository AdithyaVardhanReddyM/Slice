import type { Metadata } from "next";
import { StandaloneShell } from "@/components/console/widgets/shell";
import { NewPageFlow } from "@/components/pages/console/new-page-flow";

export const metadata: Metadata = { title: "New page" };

export default function NewPagePage() {
  return (
    <StandaloneShell>
      <NewPageFlow />
    </StandaloneShell>
  );
}

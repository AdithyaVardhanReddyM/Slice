import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/console/primitives";
import { StandaloneShell } from "@/components/console/widgets/shell";
import { PageEditor } from "@/components/pages/console/page-editor";

export const metadata: Metadata = { title: "Page" };

export default function PageEditorPage({ params }: PageProps<"/dashboard/pages/[id]">) {
  // The shell reads the pathname, which is runtime data on a dynamic route.
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Inner params={params} />
    </Suspense>
  );
}

async function Inner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <StandaloneShell>
      <PageEditor id={id} />
    </StandaloneShell>
  );
}

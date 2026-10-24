import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InstallView } from "@/components/console/install/install-view";
import { PageSkeleton } from "@/components/console/primitives";
import { appOrigin } from "@/lib/app-origin";
import { getWidget } from "@/lib/mock/widgets";

export const metadata: Metadata = { title: "Install" };

export default function InstallPage({
  params,
}: PageProps<"/dashboard/concierge/[widget]/install">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Install params={params} />
    </Suspense>
  );
}

async function Install({
  params,
}: {
  params: PageProps<"/dashboard/concierge/[widget]/install">["params"];
}) {
  const { widget: id } = await params;
  const widget = getWidget(id);
  if (!widget) notFound();

  return (
    <InstallView
      widget={widget}
      storeKey={widget.storeKey ?? widget.id}
      origin={await appOrigin()}
    />
  );
}

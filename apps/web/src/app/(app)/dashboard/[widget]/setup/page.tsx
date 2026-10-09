import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageSkeleton } from "@/components/console/primitives";
import { setupDataFor } from "@/components/console/setup/setup-data";
import { SetupFlow } from "@/components/console/setup/setup-flow";
import { getWidget } from "@/lib/mock/widgets";

export const metadata: Metadata = { title: "Setup" };

export default function SetupPage({
  params,
}: PageProps<"/dashboard/[widget]/setup">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Setup params={params} />
    </Suspense>
  );
}

async function Setup({
  params,
}: {
  params: PageProps<"/dashboard/[widget]/setup">["params"];
}) {
  const { widget: id } = await params;
  const widget = getWidget(id);
  if (!widget) notFound();

  return <SetupFlow widget={widget} {...setupDataFor(widget)} />;
}

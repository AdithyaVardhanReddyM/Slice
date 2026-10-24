import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageSkeleton } from "@/components/console/primitives";
import { SettingsView } from "@/components/console/settings/settings-view";
import { getWidget } from "@/lib/mock/widgets";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage({
  params,
}: PageProps<"/dashboard/concierge/[widget]/settings">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SettingsContent params={params} />
    </Suspense>
  );
}

async function SettingsContent({
  params,
}: {
  params: PageProps<"/dashboard/concierge/[widget]/settings">["params"];
}) {
  const { widget: widgetId } = await params;
  const widget = getWidget(widgetId);
  if (!widget) notFound();

  return (
    <SettingsView widget={widget} storeKey={widget.storeKey ?? widget.id} />
  );
}

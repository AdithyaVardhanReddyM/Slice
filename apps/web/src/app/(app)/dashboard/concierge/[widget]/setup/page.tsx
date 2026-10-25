import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageSkeleton } from "@/components/console/primitives";
import { setupDataFor } from "@/components/console/setup/setup-data";
import { SetupFlow } from "@/components/console/setup/setup-flow";
import { appOrigin } from "@/lib/app-origin";
import type { CatalogSourceKind } from "@/lib/mock/types";
import { getWidget } from "@/lib/mock/widgets";

export const metadata: Metadata = { title: "Setup" };

type Props = PageProps<"/dashboard/concierge/[widget]/setup">;

/** Store platforms the new-widget form can hand over (?source=shopify). */
const SOURCES = new Set<CatalogSourceKind>(["shopify", "woocommerce", "upload", "feed", "api"]);

export default function SetupPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Setup params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Setup({
  params,
  searchParams,
}: {
  params: Props["params"];
  searchParams: Props["searchParams"];
}) {
  const { widget: id } = await params;
  const { source } = await searchParams;
  const widget = getWidget(id);
  if (!widget) notFound();

  return (
    <SetupFlow
      widget={widget}
      origin={await appOrigin()}
      catalogSource={
        typeof source === "string" && SOURCES.has(source as CatalogSourceKind)
          ? (source as CatalogSourceKind)
          : null
      }
      {...setupDataFor(widget)}
    />
  );
}

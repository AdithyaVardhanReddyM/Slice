import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, Lightbulb } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { styleCoverage } from "@/components/console/catalog/rows";
import {
  EmptyState,
  PageHeader,
  PageSkeleton,
} from "@/components/console/primitives";
import {
  cities,
  clusters,
  demandVsSupply,
  tasteMap,
  topSignals,
} from "@/components/console/taste/aggregate";
import {
  DemandLegend,
  DemandSupply,
} from "@/components/console/taste/demand-supply";
import {
  CityTable,
  ClusterTable,
  SignalGrid,
} from "@/components/console/taste/sections";
import { TasteHeatmap } from "@/components/console/taste/taste-heatmap";
import { catalogs } from "@/lib/mock/catalog";
import { conversationsFor } from "@/lib/mock/conversations";
import { getWidget } from "@/lib/mock/widgets";
import { fmt } from "@/lib/format";

export const metadata: Metadata = { title: "Taste insights" };

export default function TastePage({
  params,
}: PageProps<"/dashboard/[widget]/taste">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TasteContent params={params} />
    </Suspense>
  );
}

async function TasteContent({
  params,
}: {
  params: PageProps<"/dashboard/[widget]/taste">["params"];
}) {
  const { widget: widgetId } = await params;
  const widget = getWidget(widgetId);
  if (!widget) notFound();

  const convs = conversationsFor(widget.id);

  if (!widget.storeKey || convs.length === 0) {
    return (
      <div className="mx-auto w-full max-w-7xl px-6 py-6">
        <PageHeader
          title="Taste insights"
          description="What your shoppers are into, aggregated from their conversations with the concierge."
        />
        <Card className="py-0">
          <EmptyState
            className="border-0 py-20"
            title="No taste signals yet"
            body="Once shoppers start talking to the concierge, their picks resolve through Qloo and show up here as audience taste, clusters and catalog gaps."
            action={
              <Link
                href={`/dashboard/${widget.id}/${widget.status === "setup" ? "setup" : "install"}`}
                className={buttonVariants()}
              >
                {widget.status === "setup"
                  ? "Finish setup"
                  : "Install the widget"}
              </Link>
            }
          />
        </Card>
      </div>
    );
  }

  const catalog = catalogs[widget.storeKey];
  const coverage = styleCoverage(catalog);
  const styles = catalog.store.styles.map((s) => ({
    id: s.id,
    label: s.label,
  }));
  const total = convs.length;
  const since = convs.reduce(
    (min, c) => (c.startedAt < min ? c.startedAt : min),
    convs[0].startedAt,
  );

  const signals = topSignals(convs);
  const groups = clusters(convs);
  const map = tasteMap(convs, styles);
  const demand = demandVsSupply(convs, coverage);
  const cityRows = cities(convs);
  const lead = demand[0];
  const surplus = demand.at(-1);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-6">
      <PageHeader
        title="Taste insights"
        description={
          <>
            Aggregated from <span className="num">{total}</span> conversations
            since {fmt.date(since)}. Picks from the taste questionnaire and chat
            resolve to Qloo entities, then to taste tags, then onto your style
            axis.
          </>
        }
        actions={
          <Button variant="outline">
            <Download />
            Export CSV
          </Button>
        }
      />

      <div className="space-y-6">
        {lead && lead.gap > 0 && (
          <Card size="sm">
            <CardContent className="flex items-start gap-3">
              <Lightbulb className="mt-0.5 size-4 flex-none text-muted-foreground" />
              <p className="text-sm">
                <span className="font-medium">{lead.label}</span> draws{" "}
                <span className="num">{fmt.pct(lead.demand, 0)}</span> of
                shopper taste but only{" "}
                <span className="num">{fmt.pct(lead.supply, 0)}</span> of your
                catalog.
                {surplus && surplus.gap < 0 && (
                  <>
                    {" "}
                    <span className="font-medium">{surplus.label}</span> has the
                    opposite problem.
                  </>
                )}
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Top taste signals</CardTitle>
            <CardDescription>
              Qloo entities shoppers picked or mentioned, by number of
              conversations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SignalGrid domains={signals} />
          </CardContent>
        </Card>

        <Card className="pb-0">
          <CardHeader>
            <CardTitle>Taste clusters</CardTitle>
            <CardDescription>
              Conversations grouped by taste archetype. Conversion means added
              to cart or purchased.
            </CardDescription>
          </CardHeader>
          <div className="border-t">
            <ClusterTable clusters={groups} total={total} />
          </div>
        </Card>

        <TasteHeatmap data={map} total={total} />

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card className="pb-0 xl:col-span-2">
            <CardHeader>
              <CardTitle>Demand vs. supply</CardTitle>
              <CardDescription>
                Share of shopper style affinity vs. share of catalog
              </CardDescription>
              <CardAction className="hidden sm:block">
                <DemandLegend />
              </CardAction>
            </CardHeader>
            <div className="border-t">
              <DemandSupply rows={demand} />
            </div>
          </Card>

          <Card className="self-start pb-0">
            <CardHeader>
              <CardTitle>Cities</CardTitle>
              <CardDescription>Where shoppers are</CardDescription>
            </CardHeader>
            <div className="border-t">
              <CityTable rows={cityRows} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

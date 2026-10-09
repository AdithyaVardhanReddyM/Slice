import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardContent,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  buildLog,
  hourly,
  latencyHistogram,
  logStats,
} from "@/components/console/activity/build";
import { CachePolicy } from "@/components/console/activity/cache-policy";
import {
  CallsPerHour,
  LatencyHistogram,
} from "@/components/console/activity/charts";
import { SignalLog } from "@/components/console/activity/signal-log";
import { StatCard, StatGrid } from "@/components/console/catalog/stat-card";
import {
  EmptyState,
  PageHeader,
  PageSkeleton,
} from "@/components/console/primitives";
import { conversationsFor } from "@/lib/mock/conversations";
import { NOW } from "@/lib/mock/random";
import { getWidget, workspace } from "@/lib/mock/widgets";
import { fmt } from "@/lib/format";

export const metadata: Metadata = { title: "Signal log" };

export default function ActivityPage({
  params,
}: PageProps<"/dashboard/[widget]/activity">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ActivityContent params={params} />
    </Suspense>
  );
}

async function ActivityContent({
  params,
}: {
  params: PageProps<"/dashboard/[widget]/activity">["params"];
}) {
  const { widget: widgetId } = await params;
  const widget = getWidget(widgetId);
  if (!widget) notFound();

  const header = (
    <PageHeader
      title="Signal log"
      description="Every call the concierge made: Qloo lookups, model calls, catalog retrieval and Slice’s own steps. Times are UTC."
      actions={
        <Button variant="outline">
          <Download />
          Download CSV
        </Button>
      }
    />
  );

  const convs = conversationsFor(widget.id);
  if (convs.length === 0) {
    return (
      <div className="mx-auto w-full max-w-7xl px-6 py-6">
        {header}
        <Card className="py-0">
          <EmptyState
            className="border-0 py-20"
            title="No calls yet"
            body="When shoppers talk to the concierge, every Qloo lookup, model call and catalog query shows up here with its latency and cache status."
            action={
              <Link
                href={`/dashboard/${widget.id}/setup`}
                className={buttonVariants()}
              >
                Finish setup
              </Link>
            }
          />
        </Card>
      </div>
    );
  }

  const rows = buildLog(convs);
  const day = rows.filter((r) => r.t >= NOW - 86_400_000);
  const stats = logStats(rows);
  const hitRate = stats.qloo.calls ? stats.qloo.hits / stats.qloo.calls : 0;
  const quota = workspace.qlooQuota;

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-6 py-6">
      {header}

      <div className="space-y-6">
        <StatGrid className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <StatCard
            label="Calls, last 24 hours"
            value={fmt.int(stats.calls)}
            hint={
              <>
                Qloo <span className="num">{stats.byKind.qloo}</span>, LLM{" "}
                <span className="num">{stats.byKind.llm}</span>, internal{" "}
                <span className="num">
                  {stats.byKind.catalog + stats.byKind.slice}
                </span>
              </>
            }
          />
          <StatCard
            label="Qloo cache hit rate"
            value={fmt.pct(hitRate, 0)}
            hint={
              <>
                <span className="num">{stats.qloo.hits}</span> hits,{" "}
                <span className="num">{stats.qloo.misses}</span> misses,{" "}
                <span className="num">{stats.qloo.stale}</span> stale
              </>
            }
          >
            <Progress value={hitRate * 100} aria-label="Cache hit rate" />
          </StatCard>
          <StatCard
            label="Qloo latency, p50"
            value={fmt.ms(stats.qloo.p50)}
            hint={
              <>
                p95 <span className="num">{fmt.ms(stats.qloo.p95)}</span>. Cache
                misses set the tail.
              </>
            }
          />
          <StatCard
            label="LLM tokens, last 24 hours"
            value={fmt.compact(stats.tokens.input + stats.tokens.output)}
            hint={
              <>
                <span className="num">{fmt.compact(stats.tokens.input)}</span>{" "}
                in,{" "}
                <span className="num">{fmt.compact(stats.tokens.output)}</span>{" "}
                out on gemini-3.8-flash
              </>
            }
          />
          <StatCard
            label="Qloo quota this month"
            value={fmt.pct(quota.used / quota.limit, 0)}
            hint={
              <>
                <span className="num">{fmt.int(quota.used)}</span> of{" "}
                <span className="num">{fmt.int(quota.limit)}</span> calls across
                the workspace
              </>
            }
          >
            <Progress
              value={(quota.used / quota.limit) * 100}
              aria-label="Qloo quota used"
            />
          </StatCard>
        </StatGrid>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Calls per hour</CardTitle>
              <CardDescription>Last 24 hours, by kind</CardDescription>
            </CardHeader>
            <CardContent>
              <CallsPerHour buckets={hourly(rows)} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Qloo latency</CardTitle>
              <CardDescription>
                <span className="num">{stats.qloo.calls}</span> calls in the
                last 24 hours, log-spaced buckets in ms
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LatencyHistogram buckets={latencyHistogram(day)} />
            </CardContent>
          </Card>
          <CachePolicy className="lg:col-span-2 xl:col-span-1" />
        </div>

        <SignalLog rows={rows} widgetId={widget.id} />
      </div>
    </div>
  );
}

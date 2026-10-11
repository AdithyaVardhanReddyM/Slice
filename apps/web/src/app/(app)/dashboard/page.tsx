import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge, PageHeader } from "@/components/console/primitives";
import { StandaloneShell } from "@/components/console/widgets/shell";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fmt } from "@/lib/format";
import { widgets, workspace } from "@/lib/mock/widgets";
import { SERVICES } from "@/lib/services";

export const metadata: Metadata = { title: "Services" };

/** Services home: the three things a business can run with Slice. */
export default function ServicesPage() {
  const live = widgets.filter((w) => w.status === "live");
  const conversations = live.reduce((s, w) => s + w.stats7d.conversations, 0);
  const revenue = live.reduce((s, w) => s + w.stats7d.influencedRevenue, 0);

  return (
    <StandaloneShell>
      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        <PageHeader
          title={workspace.name}
          description="Each service runs on its own. Pick the ones your business needs; nothing has to be set up twice."
        />

        <div className="grid gap-6 md:grid-cols-3">
          {SERVICES.map((s) => {
            const Icon = s.icon;
            const href = `/dashboard/${s.segment}`;
            return (
              <Card key={s.id} className="flex flex-col">
                <CardHeader>
                  <div className="flex size-9 items-center justify-center rounded-md border bg-muted">
                    <Icon className="size-4 text-muted-foreground" />
                  </div>
                  <CardTitle className="pt-2">{s.label}</CardTitle>
                  <CardDescription>{s.tagline}</CardDescription>
                  <CardAction>
                    {s.available ? (
                      <Badge tone="ok">Active</Badge>
                    ) : (
                      <Badge tone="outline">Coming soon</Badge>
                    )}
                  </CardAction>
                </CardHeader>

                <CardContent className="flex-1">
                  {s.id === "concierge" ? (
                    <dl className="grid grid-cols-3 gap-3 border-t pt-4">
                      {(
                        [
                          ["Widgets", fmt.int(widgets.length)],
                          ["Conversations", fmt.int(conversations)],
                          ["Revenue", fmt.money(revenue)],
                        ] as const
                      ).map(([label, value]) => (
                        <div key={label} className="min-w-0">
                          <dt className="truncate text-xs text-muted-foreground">
                            {label}
                          </dt>
                          <dd className="num mt-0.5 text-sm font-semibold">
                            {value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="border-t pt-4 text-sm text-muted-foreground">
                      {s.description}
                    </p>
                  )}
                </CardContent>

                <CardFooter className="justify-between">
                  <Link
                    href={href}
                    className={buttonVariants({
                      variant: s.available ? "default" : "outline",
                    })}
                  >
                    {s.available ? "Open" : "See what's planned"}
                    <ArrowRight data-icon="inline-end" />
                  </Link>
                  {s.id === "concierge" && (
                    <span className="text-xs text-muted-foreground">
                      Last 7 days, live widgets
                    </span>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </div>
    </StandaloneShell>
  );
}

import type { ComponentType } from "react";
import { Badge, PageHeader } from "@/components/console/primitives";
import { StandaloneShell } from "@/components/console/widgets/shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ServiceMeta } from "@/lib/services";

export interface Capability {
  icon: ComponentType<{ className?: string }>;
  title: string;
  body: string;
}

export interface TargetingSignal {
  title: string;
  body: string;
}

/**
 * Screen for a service that isn't built yet: what it will do and what it
 * targets on. It stands alone, like the other services; nothing here depends
 * on a Concierge widget.
 */
export function ServicePlaceholder({
  service,
  capabilities,
  signals,
}: {
  service: ServiceMeta;
  capabilities: Capability[];
  signals: TargetingSignal[];
}) {
  return (
    <StandaloneShell>
      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        <PageHeader
          title={service.label}
          description={service.tagline}
          actions={
            <>
              <Badge tone="outline">Coming soon</Badge>
              <Button variant="outline">Request early access</Button>
            </>
          }
        />

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>What you&apos;ll be able to do</CardTitle>
              <CardDescription>{service.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                {capabilities.map((c) => {
                  const Icon = c.icon;
                  return (
                    <div
                      key={c.title}
                      className="space-y-2 rounded-lg border p-4"
                    >
                      <div className="flex size-8 items-center justify-center rounded-md bg-muted">
                        <Icon className="size-4 text-muted-foreground" />
                      </div>
                      <div className="text-sm font-medium">{c.title}</div>
                      <p className="text-sm text-muted-foreground">{c.body}</p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Targeting</CardTitle>
              <CardDescription>
                What decides which version a visitor gets. Each{" "}
                {service.label.toLowerCase()} client brings its own data;
                nothing is shared with other services.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {signals.map((s) => (
                  <li
                    key={s.title}
                    className="flex gap-4 py-3 first:pt-0 last:pb-0"
                  >
                    <span className="w-44 shrink-0 text-sm font-medium">
                      {s.title}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {s.body}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </StandaloneShell>
  );
}

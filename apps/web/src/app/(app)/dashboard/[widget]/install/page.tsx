import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import {
  Badge,
  KeyValue,
  PageHeader,
  PageSkeleton,
} from "@/components/console/primitives";
import { CopyButton } from "@/components/console/setup/atoms";
import { CodeBlock } from "@/components/console/setup/code";
import {
  AllowedDomainsPanel,
  PublicKeyPanel,
  SnippetPanel,
  VerifyPanel,
} from "@/components/console/setup/install";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { installState } from "@/lib/mock/setup";
import { getWidget } from "@/lib/mock/widgets";

export const metadata: Metadata = { title: "Install" };

const CSP = `script-src https://cdn.slice.so;
connect-src https://api.slice.so wss://rt.slice.so;
frame-src https://slice.so;`;

export default function InstallPage({
  params,
}: PageProps<"/dashboard/[widget]/install">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Install params={params} />
    </Suspense>
  );
}

async function Install({
  params,
}: {
  params: PageProps<"/dashboard/[widget]/install">["params"];
}) {
  const { widget: id } = await params;
  const widget = getWidget(id);
  if (!widget) notFound();

  const install = installState[widget.id] ?? {
    domains: [
      { host: widget.domain, status: "pending" as const, primary: true },
    ],
  };
  const sandbox = `/embed/concierge?key=${widget.publicKey}&sandbox=1`;

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-6">
      <PageHeader
        title="Install"
        description={`One script tag on ${widget.domain}. It loads async, so it never slows your pages down.`}
        actions={
          <>
            {install.lastSeen ? (
              <Badge tone="ok">Installed</Badge>
            ) : (
              <Badge tone="warn">Not detected</Badge>
            )}
            <a
              href={sandbox}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "outline" })}
            >
              Test in sandbox <ArrowUpRight data-icon="inline-end" />
            </a>
          </>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <SnippetPanel publicKey={widget.publicKey} />
          <AllowedDomainsPanel initial={install.domains} />
        </div>

        <div className="space-y-6">
          <VerifyPanel domain={widget.domain} lastSeen={install.lastSeen} />
          <PublicKeyPanel publicKey={widget.publicKey} />
          <Card>
            <CardHeader>
              <CardTitle>Script</CardTitle>
            </CardHeader>
            <CardContent>
              <KeyValue
                rows={[
                  ["Version", "v1.4.2, auto-updates"],
                  [
                    "Size",
                    <span key="s" className="num">
                      11.8 kB gzipped
                    </span>,
                  ],
                  ["Loading", "Async, after idle"],
                  ["Cookies", "None. Session ID in sessionStorage"],
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Content Security Policy</CardTitle>
              <CardDescription>
                Only needed if your site sends a CSP header. Add these sources.
              </CardDescription>
              <CardAction>
                <CopyButton value={CSP} />
              </CardAction>
            </CardHeader>
            <CardContent>
              <CodeBlock code={CSP} language="text" />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

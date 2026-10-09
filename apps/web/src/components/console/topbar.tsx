"use client";

import Link from "next/link";
import { Fragment } from "react";
import { useParams, usePathname } from "next/navigation";
import { ExternalLink, Search } from "lucide-react";
import { getWidget } from "@/lib/mock/widgets";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Kbd } from "./primitives";

const SECTION_LABELS: Record<string, string> = {
  conversations: "Conversations",
  taste: "Taste insights",
  activity: "Signal log",
  catalog: "Catalog",
  install: "Install",
  settings: "Settings",
  setup: "Setup",
};

const STORES_URL =
  process.env.NEXT_PUBLIC_STORES_URL ?? "http://localhost:3002";

export function Topbar() {
  const { widget: widgetId } = useParams<{ widget: string }>();
  const pathname = usePathname();
  const widget = getWidget(widgetId);
  const parts = pathname.split("/").slice(3);

  const crumbs: { label: string; href?: string }[] = [
    { label: widget?.name ?? widgetId, href: `/dashboard/${widgetId}` },
  ];
  if (parts[0]) {
    crumbs.push({
      label: SECTION_LABELS[parts[0]] ?? parts[0],
      href: parts[1] ? `/dashboard/${widgetId}/${parts[0]}` : undefined,
    });
  } else {
    crumbs.push({ label: "Overview" });
  }
  if (parts[1]) crumbs.push({ label: parts[1] });

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-4 rounded-t-xl border-b bg-background/95 px-4 backdrop-blur">
      <div className="flex min-w-0 items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            {crumbs.map((c, i) => (
              <Fragment key={i}>
                {i > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  {c.href ? (
                    <BreadcrumbLink render={<Link href={c.href} />}>
                      {c.label}
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>{c.label}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          className="w-64 justify-start font-normal text-muted-foreground"
        >
          <Search />
          <span className="flex-1 text-left">Search…</span>
          <Kbd>⌘K</Kbd>
        </Button>
        {widget?.storeKey && (
          <Button
            variant="ghost"
            nativeButton={false}
            render={
              <a
                href={`${STORES_URL}/${widget.storeKey}`}
                target="_blank"
                rel="noreferrer"
              />
            }
          >
            View store
            <ExternalLink />
          </Button>
        )}
      </div>
    </header>
  );
}

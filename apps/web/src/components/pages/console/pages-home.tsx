"use client";

import Link from "next/link";
import { useConvexAuth, useQuery } from "convex/react";
import { ExternalLink, Plus } from "lucide-react";
import { api } from "@slice/backend/convex/_generated/api";
import { Badge, EmptyState, PageHeader, Skeleton } from "@/components/console/primitives";
import { buttonVariants } from "@/components/ui/button";
import { BrandLogo } from "./atoms";

/** The Pages service home: the merchant's pages, newest first. */
export function PagesHome() {
  const { isLoading } = useConvexAuth();
  const pages = useQuery(api.pages.list, isLoading ? "skip" : {});

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <PageHeader
        title="Pages"
        description="Landing pages built from your website that rewrite themselves for each visitor's cultural taste, read by Qloo."
        actions={
          <Link href="/dashboard/pages/new" className={buttonVariants()}>
            <Plus />
            New page
          </Link>
        }
      />
      {pages === undefined ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : pages.length === 0 ? (
        <EmptyState
          title="No pages yet"
          body="Paste your website. Slice reads your logo, colours and voice, asks Qloo who your audience is, and writes a page with a version for each of their tastes."
          action={
            <Link href="/dashboard/pages/new" className={buttonVariants()}>
              <Plus />
              Create your first page
            </Link>
          }
        />
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {pages.map((p) => (
            <Link
              key={p._id}
              href={`/dashboard/pages/${p._id}`}
              className="group flex flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 transition hover:ring-foreground/25"
            >
              <div
                className="flex h-20 items-center px-5"
                style={{
                  background: p.brand
                    ? `linear-gradient(135deg, ${p.brand.colors.primary}, ${p.brand.colors.accent})`
                    : undefined,
                }}
              >
                {p.brand ? (
                  <span className="rounded-lg bg-white/90 p-1.5">
                    <BrandLogo kit={p.brand} className="h-6" />
                  </span>
                ) : null}
              </div>
              <div className="flex flex-1 flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-medium">{p.name}</h3>
                    <p className="truncate text-xs text-muted-foreground">/p/{p.slug}</p>
                  </div>
                  {p.status === "generating" ? (
                    <Badge tone="marker">Generating</Badge>
                  ) : p.status === "failed" ? (
                    <Badge tone="bad">Failed</Badge>
                  ) : p.published ? (
                    <Badge tone="ok">Live</Badge>
                  ) : (
                    <Badge tone="outline">Draft</Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {p.segments.map((s) => (
                    <Badge key={s.id} tone={s.isDefault ? "outline" : "neutral"}>
                      {s.name}
                    </Badge>
                  ))}
                  {p.status === "generating" && p.progress ? (
                    <span className="text-xs text-muted-foreground">{p.progress}…</span>
                  ) : null}
                </div>
                <div className="mt-auto flex items-center justify-between text-xs text-muted-foreground">
                  <span>Updated {new Date(p.updatedAt).toLocaleDateString()}</span>
                  {p.published ? <ExternalLink className="size-3.5" /> : null}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

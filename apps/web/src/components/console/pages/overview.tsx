"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowRight, FileText, Palette, Plus, Users } from "lucide-react";
import { api } from "@slice/backend/convex/_generated/api";
import { fmt } from "@/lib/format";
import { kitOf, type Audience, type Page } from "@/lib/pages/types";
import { PageHeader, Skeleton, Stat } from "@/components/console/primitives";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBrand } from "./brand-context";
import { StatusBadge } from "./shared";

interface OverviewRow {
  pageId: string;
  title?: string;
  slug?: string;
  status?: string;
  views: number;
  sessions: number;
  ctaRate: number;
  topVariant?: { name?: string; variantId?: string } | string | null;
}

export function BrandOverview() {
  const brand = useBrand();
  const base = `/dashboard/pages/${brand.slug}`;
  const pages = useQuery(api.pages.list, { brandId: brand._id }) as Page[] | undefined;
  const audiences = useQuery(api.pagesAudiences.list, { brandId: brand._id }) as Audience[] | undefined;
  const overview = useQuery(api.pagesEvents.brandOverview, { brandId: brand._id, days: 7 }) as OverviewRow[] | undefined;
  const kit = kitOf(brand);
  const byPage = new Map((overview ?? []).map((r) => [String(r.pageId), r]));
  const views = (overview ?? []).reduce((s, r) => s + (r.views ?? 0), 0);
  const sessions = (overview ?? []).reduce((s, r) => s + (r.sessions ?? 0), 0);
  const published = (pages ?? []).filter((p) => p.status === "published").length;
  const topVariantLabel = (r?: OverviewRow) => {
    if (!r?.topVariant) return "—";
    return typeof r.topVariant === "string" ? r.topVariant : r.topVariant.name ?? "—";
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-6">
      <PageHeader
        title={brand.name}
        description={brand.brief?.summary ?? brand.url}
        actions={
          <>
            <Link href={`${base}/audiences`} className={buttonVariants({ variant: "outline" })}>
              <Users data-icon="inline-start" /> New audience
            </Link>
            <Link href={`${base}/new`} className={buttonVariants()}>
              <Plus data-icon="inline-start" /> New page
            </Link>
          </>
        }
      />

      <div className="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Views, last 7 days" value={overview === undefined ? <Skeleton className="h-7 w-16" /> : fmt.compact(views)} />
        <Stat label="Sessions, last 7 days" value={overview === undefined ? <Skeleton className="h-7 w-16" /> : fmt.compact(sessions)} />
        <Stat label="Pages" value={pages === undefined ? <Skeleton className="h-7 w-10" /> : fmt.int(pages.length)} hint={pages ? `${published} published` : undefined} />
        <Stat
          label="Audiences"
          value={audiences === undefined ? <Skeleton className="h-7 w-10" /> : fmt.int(audiences.length)}
          hint={audiences ? `${audiences.filter((a) => a.status === "ready").length} ready` : undefined}
        />
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Pages</CardTitle>
            <CardDescription>Views, click-through and the version visitors respond to most, last 7 days.</CardDescription>
          </CardHeader>
          <CardContent>
            {pages === undefined ? (
              <Skeleton className="h-40 w-full" />
            ) : pages.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                No pages yet.{" "}
                <Link href={`${base}/new`} className="text-foreground underline underline-offset-4">
                  Create the first one
                </Link>
                .
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Page</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Views</TableHead>
                    <TableHead className="text-right">CTA rate</TableHead>
                    <TableHead>Top version</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pages.map((p) => {
                    const r = byPage.get(String(p._id));
                    return (
                      <TableRow key={p._id}>
                        <TableCell>
                          <Link href={`${base}/${p.slug}`} className="font-medium hover:underline">
                            {p.title}
                          </Link>
                          <div className="text-xs text-muted-foreground">/{p.slug}</div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={p.status} />
                        </TableCell>
                        <TableCell className="num text-right">{r ? fmt.compact(r.views) : "—"}</TableCell>
                        <TableCell className="num text-right">{r ? fmt.pct(r.ctaRate ?? 0) : "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{topVariantLabel(r)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Brand kit</CardTitle>
              <CardDescription>What every page inherits.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {kit ? (
                <>
                  <div className="flex gap-1.5">
                    {(["background", "foreground", "primary", "accent", "muted", "surface"] as const).map((k) => (
                      <span key={k} className="size-7 rounded-md ring-1 ring-foreground/10" style={{ background: kit.colors[k] }} title={k} />
                    ))}
                  </div>
                  <dl className="grid grid-cols-[6rem_1fr] gap-y-1.5 text-sm">
                    <dt className="text-muted-foreground">Heading</dt>
                    <dd className="truncate">{kit.fonts.heading.family}</dd>
                    <dt className="text-muted-foreground">Body</dt>
                    <dd className="truncate">{kit.fonts.body.family}</dd>
                    <dt className="text-muted-foreground">Shape</dt>
                    <dd className="truncate">
                      {kit.radius} radius · {kit.buttonStyle} buttons · {kit.density}
                    </dd>
                  </dl>
                  {kit.voice.summary && <p className="text-sm text-muted-foreground">{kit.voice.summary}</p>}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No kit yet. Finish the intake review.</p>
              )}
              <Link href={`${base}/kit`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <Palette data-icon="inline-start" /> Edit the kit
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Audiences</CardTitle>
              <CardDescription>Who the pages are written for.</CardDescription>
            </CardHeader>
            <CardContent>
              {audiences === undefined ? (
                <Skeleton className="h-16 w-full" />
              ) : audiences.length === 0 ? (
                <p className="text-sm text-muted-foreground">None yet. Start with the brand&apos;s own city or a customer CSV.</p>
              ) : (
                <ul className="divide-y">
                  {audiences.slice(0, 5).map((a) => (
                    <li key={a._id} className="flex items-center justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0">
                      <span className="truncate">{a.name}</span>
                      <StatusBadge status={a.status} />
                    </li>
                  ))}
                </ul>
              )}
              <Link href={`${base}/audiences`} className="mt-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                All audiences <ArrowRight className="size-3.5" />
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick actions</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Link href={`${base}/new`} className={buttonVariants({ variant: "outline", className: "justify-start" })}>
                <FileText data-icon="inline-start" /> New page
              </Link>
              <Link href={`${base}/audiences?new=1`} className={buttonVariants({ variant: "outline", className: "justify-start" })}>
                <Users data-icon="inline-start" /> New audience
              </Link>
              <Link href={`${base}/analytics`} className={buttonVariants({ variant: "outline", className: "justify-start" })}>
                <ArrowRight data-icon="inline-start" /> Analytics
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { ExternalLink, FileText, Plus } from "lucide-react";
import { api } from "@slice/backend/convex/_generated/api";
import { fmt } from "@/lib/format";
import { GOALS, type Page } from "@/lib/pages/types";
import { publicPageUrl } from "@/lib/pages/urls";
import { EmptyState, PageHeader, Skeleton } from "@/components/console/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBrand } from "./brand-context";
import { StatusBadge, relativeTime } from "./shared";

type PageRow = Page & { variantCount?: number; readyCount?: number; variants?: { status: string }[] };

export function PagesScreen() {
  const brand = useBrand();
  const router = useRouter();
  const pages = useQuery(api.pages.list, { brandId: brand._id }) as PageRow[] | undefined;
  const base = `/dashboard/pages/${brand.slug}`;
  const newPage = () => router.push(`${base}/new`);

  const counts = (p: PageRow) => {
    const total = p.variantCount ?? p.variants?.length ?? p.audienceIds.length + 1;
    const ready = p.readyCount ?? p.variants?.filter((v) => v.status === "ready").length;
    return ready === undefined ? `${total}` : `${ready} of ${total} ready`;
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-6">
      <PageHeader
        title="Pages"
        description="Each page is one brief with one version per audience. Build in the editor, publish on the brand's subdomain, compare in Analytics."
        actions={
          <Button onClick={newPage} disabled={brand.status !== "ready" && brand.status !== "review"}>
            <Plus data-icon="inline-start" /> New page
          </Button>
        }
      />
      {pages === undefined ? (
        <Skeleton className="h-48 w-full rounded-xl" />
      ) : pages.length === 0 ? (
        <EmptyState
          title="No pages yet"
          body="Describe the page in a sentence or two and the builder sets it up, with a version for each audience you mention."
          action={
            <Button onClick={newPage}>
              <FileText data-icon="inline-start" /> New page
            </Button>
          }
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Page</TableHead>
                <TableHead>Goal</TableHead>
                <TableHead>Versions</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Link</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pages.map((p) => (
                <TableRow key={p._id} className="cursor-pointer" onClick={() => router.push(`${base}/${p.slug}`)}>
                  <TableCell>
                    <Link href={`${base}/${p.slug}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                      {p.title}
                    </Link>
                    <div className="truncate text-xs text-muted-foreground">/{p.slug}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{GOALS.find((g) => g.value === p.brief.goal)?.label ?? p.brief.goal}</Badge>
                  </TableCell>
                  <TableCell className="num text-muted-foreground">{counts(p)}</TableCell>
                  <TableCell>
                    <StatusBadge status={p.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{relativeTime(p.updatedAt)}</TableCell>
                  <TableCell className="text-right">
                    {p.status === "published" ? (
                      <a
                        href={publicPageUrl(brand.slug, p.slug)}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                      >
                        Open <ExternalLink className="size-3.5" />
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">{fmt.int(p.audienceIds.length)} audience{p.audienceIds.length === 1 ? "" : "s"}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

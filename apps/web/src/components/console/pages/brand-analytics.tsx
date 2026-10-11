"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Audience, Page, Variant } from "@/lib/pages/types";
import { Select } from "@/components/console/form";
import { EmptyState, PageHeader, PageSkeleton } from "@/components/console/primitives";
import { PageAnalytics } from "./analytics/page-analytics";
import { useBrand } from "./brand-context";

function PageBlock({ page }: { page: Page }) {
  const bundle = useQuery(api.pages.get, { id: page._id }) as { page: Page; variants: Variant[]; audiences: Audience[] } | null | undefined;
  const variants = useMemo(() => {
    if (!bundle) return [];
    const def = bundle.variants.find((v) => v._id === bundle.page.defaultVariantId) ?? bundle.variants.find((v) => !v.audienceId);
    return def ? [def, ...bundle.variants.filter((v) => v !== def)] : bundle.variants;
  }, [bundle]);
  if (bundle === undefined) return <PageSkeleton />;
  if (!bundle) return null;
  return <PageAnalytics page={bundle.page} variants={variants} audiences={bundle.audiences} />;
}

/** Brand-level analytics: pick a page, see its full report. */
export function BrandAnalytics() {
  const brand = useBrand();
  const router = useRouter();
  const params = useSearchParams();
  const pages = useQuery(api.pages.list, { brandId: brand._id }) as Page[] | undefined;
  const selectedSlug = params.get("page") ?? pages?.find((p) => p.status === "published")?.slug ?? pages?.[0]?.slug ?? null;
  const page = pages?.find((p) => p.slug === selectedSlug) ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mx-auto w-full max-w-7xl px-6 pt-6">
        <PageHeader
          title="Analytics"
          description="First-party measurement per page: which version visitors respond to, when they come, where they click."
          actions={
            pages && pages.length > 0 ? (
              <Select value={selectedSlug ?? ""} onChange={(e) => router.replace(`/dashboard/pages/${brand.slug}/analytics?page=${e.target.value}`)} className="min-w-56">
                {pages.map((p) => (
                  <option key={p._id} value={p.slug}>
                    {p.title}
                    {p.status === "published" ? "" : " (draft)"}
                  </option>
                ))}
              </Select>
            ) : null
          }
        />
      </div>
      {pages === undefined ? (
        <PageSkeleton />
      ) : pages.length === 0 ? (
        <div className="mx-auto w-full max-w-7xl px-6">
          <EmptyState title="No pages to measure" body="Create and publish a page; its traffic shows up here within seconds." />
        </div>
      ) : page ? (
        <PageBlock key={page._id} page={page} />
      ) : null}
    </div>
  );
}

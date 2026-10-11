"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { Plus, Users } from "lucide-react";
import { useState } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import { fmt } from "@/lib/format";
import { AUDIENCE_KIND_LABEL, audienceBriefOf, profileOf, type Audience, type Upload } from "@/lib/pages/types";
import { EmptyState, PageHeader, Skeleton } from "@/components/console/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AudienceDrawer } from "./audience-drawer";
import { useBrand } from "./brand-context";
import { NewAudienceSheet } from "./new-audience-sheet";
import { DemographicsBars, TagChips } from "./profile-view";
import { EntityStrip, ProgressLine, StatusBadge, audienceSizeLabel } from "./shared";

export function AudienceCard({ audience, onOpen }: { audience: Audience; onOpen: () => void }) {
  const profile = profileOf(audience);
  const brief = audienceBriefOf(audience);
  const culture = profile ? [...profile.culture.artists.slice(0, 3), ...profile.culture.places.slice(0, 2), ...profile.culture.films.slice(0, 1)] : [];
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex flex-col gap-3 rounded-xl bg-card p-4 text-left ring-1 ring-foreground/10 transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-medium">{audience.name}</h3>
          <p className="truncate text-sm text-muted-foreground">{audienceSizeLabel(audience)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge variant="outline">{AUDIENCE_KIND_LABEL[audience.kind] ?? audience.kind}</Badge>
          {audience.status !== "ready" && <StatusBadge status={audience.status} />}
        </div>
      </div>
      {audience.status !== "ready" && (
        <ProgressLine progress={audience.progress} status={audience.status} error={audience.error} />
      )}
      {profile && (
        <>
          <TagChips tags={profile.tags} max={6} />
          {culture.length > 0 && <EntityStrip items={culture} max={6} size="size-6" />}
          {profile.demographics && (
            <div className="border-t pt-3">
              <DemographicsBars demographics={profile.demographics} compact />
            </div>
          )}
        </>
      )}
      {brief?.summary && <p className="line-clamp-3 border-t pt-3 text-sm text-muted-foreground">{brief.summary}</p>}
    </button>
  );
}

export function AudiencesScreen() {
  const brand = useBrand();
  const router = useRouter();
  const params = useSearchParams();
  const audiences = useQuery(api.pagesAudiences.list, { brandId: brand._id }) as Audience[] | undefined;
  const uploads = useQuery(api.pagesUploads.list, { brandId: brand._id }) as Upload[] | undefined;
  const [open, setOpen] = useState<string | null>(null);
  const sheetOpen = params.get("new") === "1";
  const setSheetOpen = (o: boolean) => router.replace(o ? `/dashboard/pages/${brand.slug}/audiences?new=1` : `/dashboard/pages/${brand.slug}/audiences`);
  const busyUploads = (uploads ?? []).filter((u) => u.status !== "ready" && u.status !== "failed");
  const selected = (audiences ?? []).find((a) => a._id === open) ?? null;

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-6">
      <PageHeader
        title="Audiences"
        description="Each audience is a taste profile Qloo built from a city, a demographic, a set of interests or a cluster of your own customers. Pages get one version per audience."
        actions={
          <Button onClick={() => setSheetOpen(true)}>
            <Plus data-icon="inline-start" /> New audience
          </Button>
        }
      />
      {busyUploads.length > 0 && (
        <div className="mb-6 space-y-3">
          {busyUploads.map((u) => (
            <div key={u._id} className="rounded-xl border bg-card p-4">
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <span className="font-medium">{u.filename}</span>
                <span className="text-muted-foreground">
                  {fmt.int(u.rowCount)} rows · <StatusBadge status={u.status} />
                </span>
              </div>
              <ProgressLine progress={u.progress} status={u.status} error={u.error} />
            </div>
          ))}
        </div>
      )}
      {audiences === undefined ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : audiences.length === 0 ? (
        <EmptyState
          title="No audiences yet"
          body="Start with the city the brand sells in, a demographic, a few interests, or upload a customer CSV and let Qloo cluster it."
          action={
            <Button onClick={() => setSheetOpen(true)}>
              <Users data-icon="inline-start" /> New audience
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {audiences.map((a) => (
            <AudienceCard key={a._id} audience={a} onOpen={() => setOpen(a._id)} />
          ))}
        </div>
      )}
      <NewAudienceSheet open={sheetOpen} onOpenChange={setSheetOpen} />
      <AudienceDrawer audience={selected} onClose={() => setOpen(null)} />
    </div>
  );
}

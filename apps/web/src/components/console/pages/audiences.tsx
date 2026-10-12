"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { FileSpreadsheet, LayoutGrid, MoreHorizontal, Plus, RefreshCw, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import { fmt } from "@/lib/format";
import { AGE_LABEL, AUDIENCE_KIND_LABEL, audienceBriefOf, profileOf, type Audience, type AudienceProfile, type Upload } from "@/lib/pages/types";
import { Segmented } from "@/components/console/form";
import { PageHeader, Skeleton } from "@/components/console/primitives";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/console/settings/confirm-dialog";
import { AudienceDrawer } from "./audience-drawer";
import { useBrand } from "./brand-context";
import { AUDIENCE_SOURCES, NewAudienceSheet, SourceIcon, useCompileAudience, type AudienceSourceKind } from "./new-audience-sheet";
import { KIND_ICON, TasteCover, coverTiles } from "./taste-cover";
import { TagChips } from "./profile-view";
import { ProgressLine, StatusBadge, audienceSubtitle } from "./shared";


/** "Skews 25 to 29, women": the strongest over-indexed age band and a clear gender lean, if any. */
function skewLabel(d: AudienceProfile["demographics"] | undefined) {
  if (!d) return null;
  const [topAge, topValue] = Object.entries(d.age ?? {}).sort((a, b) => b[1] - a[1])[0] ?? [];
  const age = topAge && (topValue ?? 0) > 0.05 ? (AGE_LABEL[topAge] ?? topAge).toLowerCase() : null;
  const f = d.gender?.female ?? 0;
  const m = d.gender?.male ?? 0;
  const gender = Math.abs(f - m) > 0.1 ? (f > m ? "women" : "men") : null;
  if (!age && !gender) return "No strong age or gender lean";
  return `Skews ${[age, gender].filter(Boolean).join(", ")}`;
}


export function AudienceCard({ audience, onOpen }: { audience: Audience; onOpen: () => void }) {
  const profile = profileOf(audience);
  const brief = audienceBriefOf(audience);
  const ready = audience.status === "ready";
  const skew = skewLabel(profile?.demographics);
  return (
    <div className="group relative flex">
      <button
        type="button"
        onClick={onOpen}
        className="flex flex-1 flex-col overflow-hidden rounded-xl bg-card text-left ring-1 ring-foreground/10 transition-shadow outline-none hover:shadow-lg focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <TasteCover
          tiles={coverTiles(profile)}
          icon={KIND_ICON[audience.kind] ?? Users}
          kindLabel={AUDIENCE_KIND_LABEL[audience.kind] ?? audience.kind}
          title={audience.name}
          subtitle={audienceSubtitle(audience)}
          corner={
            !ready ? (
              // Slides left only while the "⋯" menu (hidden until hover/focus) is showing.
              <StatusBadge
                status={audience.status}
                className="transition-[margin] group-focus-within:mr-10 group-hover:mr-10 group-has-data-popup-open:mr-10"
              />
            ) : undefined
          }
        />
        <div className="flex flex-1 flex-col gap-3 p-4">
          {!ready && <ProgressLine progress={audience.progress} status={audience.status} error={audience.error} />}
          {brief?.summary ? (
            <p className="line-clamp-2 text-sm">{brief.summary}</p>
          ) : ready ? (
            <p className="text-sm text-muted-foreground">No brief yet. Open the audience to write one.</p>
          ) : null}
          {profile && profile.tags.length > 0 && <TagChips tags={profile.tags} max={3} />}
          {profile && <p className="mt-auto text-xs text-muted-foreground">{skew ?? "No demographic read"}</p>}
        </div>
      </button>
      <CardMenu audience={audience} />
    </div>
  );
}

/** "⋯" on the card cover: recompile or delete without opening the audience. */
function CardMenu({ audience }: { audience: Audience }) {
  const remove = useMutation(api.pagesAudiences.remove);
  const run = useCompileAudience();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="absolute top-3 right-3">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label={`Actions for ${audience.name}`}
              className="flex size-8 items-center justify-center rounded-full bg-black/55 text-white opacity-0 backdrop-blur-sm transition-opacity outline-none group-hover:opacity-100 hover:bg-black/70 focus-visible:opacity-100 data-popup-open:opacity-100"
            />
          }
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => void run(audience._id)} disabled={audience.status === "compiling"}>
            <RefreshCw /> Recompile
          </DropdownMenuItem>
          {audience.kind !== "default" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setConfirm(true)}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Delete ${audience.name}?`}
        description="Pages built for this audience keep what they say and stop listing it. This cannot be undone."
        actionLabel="Delete audience"
        onConfirm={() => void remove({ id: audience._id })}
      />
    </div>
  );
}

// Empty blocks in the cover's mosaic shape: an audience waiting to be filled.
const GHOST_TILES = [0, 1, 2, 3, 4].map((i) => ({ key: `ghost-${i}`, name: "" }));

function NoAudiences({ onPick }: { onPick: (k: AudienceSourceKind | null) => void }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-semibold">Build the first audience</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Pick where it comes from. Qloo fills the cover with the artists, places and brands these people love, and the builder can write pages for them.
          </p>
        </div>
        <Button variant="outline" onClick={() => onPick(null)}>
          <LayoutGrid data-icon="inline-start" /> All sources
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {AUDIENCE_SOURCES.filter((src) => !src.soon).map((src) => (
          <button
            key={src.kind}
            type="button"
            onClick={() => onPick(src.kind)}
            className="group flex flex-col overflow-hidden rounded-xl bg-card text-left ring-1 ring-foreground/10 transition-shadow outline-none hover:shadow-lg focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <TasteCover
              tiles={GHOST_TILES}
              icon={src.icon}
              kindLabel={src.title}
              title={<span className="text-white/90">{src.example}</span>}
              subtitle="Example audience"
              corner={
                <span className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform group-hover:scale-110">
                  <Plus className="size-4" />
                </span>
              }
            />
            <div className="flex-1 p-4">
              <p className="text-sm text-muted-foreground">{src.body}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Last tile in the grid: an empty cover that opens the source picker. */
function NewAudienceTile({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex min-h-64 flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-8 text-center transition-colors outline-none hover:border-primary/50 hover:bg-primary/5 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-transform group-hover:scale-110">
        <Plus className="size-5" />
      </span>
      <span className="space-y-0.5">
        <span className="block text-sm font-medium">New audience</span>
        <span className="block text-sm text-muted-foreground">A city, a demographic, shared interests or your customers</span>
      </span>
    </button>
  );
}

const FILTERS = ["csv", "location", "demographic", "interests", "lead", "default"] as const;

const FILTER_LABEL: Record<string, string> = {
  csv: "Customer clusters",
  location: "Locations",
  demographic: "Demographics",
  interests: "Interests",
  lead: "Personal",
  default: "Everyone",
};

function FilterLabel({ label, count }: { label: string; count: number }) {
  return (
    <span className="flex items-center gap-1.5">
      {label}
      <span className="text-muted-foreground tabular-nums">{count}</span>
    </span>
  );
}

export function AudiencesScreen() {
  const brand = useBrand();
  const router = useRouter();
  const params = useSearchParams();
  const audiences = useQuery(api.pagesAudiences.list, { brandId: brand._id }) as Audience[] | undefined;
  const uploads = useQuery(api.pagesUploads.list, { brandId: brand._id }) as Upload[] | undefined;
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  // ?new=1 opens the source picker; ?new=<kind> opens straight into that form.
  const newParam = params.get("new");
  const sheetOpen = newParam !== null;
  const sheetKind = AUDIENCE_SOURCES.some((s) => s.kind === newParam) ? (newParam as AudienceSourceKind) : null;
  const base = `/dashboard/pages/${brand.slug}/audiences`;
  const openSheet = (kind: AudienceSourceKind | null) => router.replace(`${base}?new=${kind ?? 1}`);
  const closeSheet = () => router.replace(base);

  const busyUploads = (uploads ?? []).filter((u) => u.status !== "ready" && u.status !== "failed");
  const selected = (audiences ?? []).find((a) => a._id === open) ?? null;
  const kinds = FILTERS.filter((k) => (audiences ?? []).some((a) => a.kind === k));
  const shown = (audiences ?? []).filter((a) => filter === "all" || a.kind === filter);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-6">
      <PageHeader
        title="Audiences"
        description="Who the pages are written for. Each audience is a taste profile Qloo built from a city, a demographic, shared interests or your own customers; a page is built for one of them, a few combined, or everyone."
        actions={
          audiences && audiences.length > 0 ? (
            <Button onClick={() => openSheet(null)}>
              <Plus data-icon="inline-start" /> New audience
            </Button>
          ) : undefined
        }
      />

      {busyUploads.length > 0 && (
        <div className="mb-6 grid gap-3 md:grid-cols-2">
          {busyUploads.map((u) => (
            <div key={u._id} className="flex items-start gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
              <SourceIcon icon={FileSpreadsheet} />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-medium">{u.filename}</span>
                  <span className="shrink-0 text-muted-foreground">{fmt.int(u.rowCount)} rows</span>
                </div>
                <ProgressLine progress={u.progress} status={u.status} error={u.error} />
              </div>
            </div>
          ))}
        </div>
      )}

      {audiences === undefined ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : audiences.length === 0 ? (
        <NoAudiences onPick={openSheet} />
      ) : (
        <div className="space-y-4">
          {kinds.length > 1 && (
            <Segmented
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: <FilterLabel label="All" count={audiences.length} /> },
                ...kinds.map((k) => ({
                  value: k,
                  label: <FilterLabel label={FILTER_LABEL[k] ?? k} count={audiences.filter((a) => a.kind === k).length} />,
                })),
              ]}
            />
          )}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {shown.map((a) => (
              <AudienceCard key={a._id} audience={a} onOpen={() => setOpen(a._id)} />
            ))}
            <NewAudienceTile onOpen={() => openSheet(null)} />
          </div>
        </div>
      )}

      <NewAudienceSheet open={sheetOpen} kind={sheetKind} onOpenChange={(o) => (o ? openSheet(sheetKind) : closeSheet())} onKindChange={openSheet} />
      <AudienceDrawer audience={selected} onClose={() => setOpen(null)} />
    </div>
  );
}

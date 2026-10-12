"use client";

import { useMutation, useQuery } from "convex/react";
import { Hourglass, Link2, MapPinOff, PenLine, RefreshCw, Trash2, Users, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import { fmt } from "@/lib/format";
import { postJson } from "@/lib/pages/stream";
import { AUDIENCE_KIND_LABEL, audienceBriefOf, profileOf, type Audience, type Member, type Page } from "@/lib/pages/types";
import { publicPageUrl } from "@/lib/pages/urls";
import { Tab, TabList, TabPanel, Tabs } from "@/components/console/form";
import { CopyButton, Spinner } from "@/components/console/setup/atoms";
import { ConfirmDialog } from "@/components/console/settings/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBrand } from "./brand-context";
import { useCompileAudience } from "./new-audience-sheet";
import { AudienceBriefView, BrandsList, CultureLists, DemographicsBars, GeoList, TagTable } from "./profile-view";
import { CityMap } from "./city-picker";
import { EntityStrip, Hint, ProgressLine, StatusBadge, TraceList, audienceSizeLabel, audienceSubtitle } from "./shared";
import { KIND_ICON, TasteCover, coverTiles } from "./taste-cover";

/* Members (CSV clusters) ----------------------------------------------------------- */

function PersonalLink({ member }: { member: Member }) {
  const brand = useBrand();
  const createLead = useMutation(api.pagesUploads.createLead);
  const run = useCompileAudience();
  const pages = useQuery(api.pages.list, { brandId: brand._id }) as Page[] | undefined;
  const [busy, setBusy] = useState(false);
  const hasLead = !!member.leadAudienceId;
  // Pages built for this one person (their lead audience), published.
  const theirs = (pages ?? []).filter((p) => p.status === "published" && !!member.leadAudienceId && p.audienceIds.includes(member.leadAudienceId));

  async function make() {
    setBusy(true);
    try {
      const { audienceId } = await createLead({ memberId: member._id });
      void run(audienceId);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" size="xs" />}>
        <Link2 data-icon="inline-start" /> Personal link
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-3" align="end">
        <div>
          <div className="text-sm font-medium">Personal link</div>
          <p className="text-xs text-muted-foreground">
            A page written for this one person. Create their audience, then ask the builder for a page for them with @ and their name.
          </p>
        </div>
        {!hasLead ? (
          <Button size="sm" onClick={make} disabled={busy}>
            {busy && <Spinner data-icon="inline-start" />}
            Create their audience
          </Button>
        ) : theirs.length === 0 ? (
          <Hint>No published page for them yet. In the builder, @mention their audience and ask for a page for them.</Hint>
        ) : (
          <ul className="space-y-2">
            {theirs.map((p) => {
              const url = publicPageUrl(brand.slug, p.slug);
              return (
                <li key={p._id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate">{p.title}</span>
                  <CopyButton value={url} label="Copy" size="sm" />
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

function MembersTable({ audience }: { audience: Audience }) {
  const uploadId = audience.sources.uploadId;
  const cluster = audience.sources.cluster;
  const members = useQuery(
    api.pagesUploads.members,
    uploadId ? { uploadId, cluster, take: 100 } : "skip",
  ) as Member[] | undefined;
  if (!uploadId) return <Hint>Not a CSV audience.</Hint>;
  if (members === undefined) return <Spinner />;
  if (members.length === 0) return <Hint>No members in this cluster.</Hint>;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead>Where</TableHead>
            <TableHead>Resolved tastes</TableHead>
            <TableHead className="text-right">Link</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((m) => {
            const name = m.row.name ?? m.row.first_name ?? m.row.full_name ?? m.row.email ?? m.row.id ?? m._id.slice(-6);
            return (
              <TableRow key={m._id}>
                <TableCell>
                  <div className="font-medium">{name}</div>
                  <div className="text-xs text-muted-foreground">
                    {[m.age, m.gender].filter(Boolean).join(" · ")}
                    {m.leadAudienceId && (
                      <Badge variant="secondary" className="ml-1.5">
                        personal
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{[m.city, m.country].filter(Boolean).join(", ") || "—"}</TableCell>
                <TableCell>
                  <EntityStrip items={m.entities} max={4} size="size-5" />
                </TableCell>
                <TableCell className="text-right">
                  <PersonalLink member={m} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/* Drawer ------------------------------------------------------------------------ */

export function AudienceDrawer({ audience, onClose }: { audience: Audience | null; onClose: () => void }) {
  const remove = useMutation(api.pagesAudiences.remove);
  const run = useCompileAudience();
  const [briefBusy, setBriefBusy] = useState(false);
  const profile = profileOf(audience);
  const brief = audienceBriefOf(audience);

  async function writeBrief(id: Id<"pagesAudiences">) {
    setBriefBusy(true);
    try {
      await postJson("/api/pages/audience-brief", { audience_id: id });
    } catch {
      /* the agent may be offline; the brief stays empty */
    } finally {
      setBriefBusy(false);
    }
  }

  const geoCity = profile?.geo.find((g) => g.lat !== undefined && g.lon !== undefined);
  const signals = profile?.entities ?? [];

  return (
    <Sheet open={!!audience} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto bg-background data-[side=right]:sm:max-w-3xl [&>[data-slot=sheet-close]]:z-20 [&>[data-slot=sheet-close]]:rounded-full [&>[data-slot=sheet-close]]:bg-black/55 [&>[data-slot=sheet-close]]:text-white [&>[data-slot=sheet-close]]:backdrop-blur-sm [&>[data-slot=sheet-close]]:hover:bg-black/70">
        {audience && (
          <>
            <TasteCover
              tiles={coverTiles(profile)}
              icon={KIND_ICON[audience.kind] ?? Users}
              kindLabel={AUDIENCE_KIND_LABEL[audience.kind] ?? audience.kind}
              title={audience.name}
              subtitle={audienceSubtitle(audience)}
              corner={audience.status !== "ready" ? <StatusBadge status={audience.status} /> : undefined}
              className="aspect-[21/8] shrink-0"
            />
            <SheetHeader className="sr-only">
              <SheetTitle>{audience.name}</SheetTitle>
              <SheetDescription>{audienceSizeLabel(audience)}</SheetDescription>
            </SheetHeader>

            <div className="space-y-4 border-b bg-background px-6 py-5">
              {brief?.summary ? (
                <p className="text-[15px] leading-relaxed">{brief.summary}</p>
              ) : (
                <p className="text-sm text-muted-foreground">No brief yet. Write one to get a summary of who these people are.</p>
              )}
              {audience.status !== "ready" && <ProgressLine progress={audience.progress} status={audience.status} error={audience.error} />}
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => void run(audience._id)} disabled={audience.status === "compiling"}>
                  <RefreshCw data-icon="inline-start" /> Recompile
                </Button>
                <Button variant="outline" size="sm" onClick={() => void writeBrief(audience._id)} disabled={briefBusy || !profile}>
                  {briefBusy ? <Spinner data-icon="inline-start" /> : <PenLine data-icon="inline-start" />}
                  {brief ? "Rewrite brief" : "Write brief"}
                </Button>
                {audience.kind !== "default" && (
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" size="sm" className="ml-auto text-destructive hover:text-destructive">
                        <Trash2 data-icon="inline-start" /> Delete
                      </Button>
                    }
                    title={`Delete ${audience.name}?`}
                    description="Pages built for this audience keep what they say and stop listing it. This cannot be undone."
                    actionLabel="Delete audience"
                    onConfirm={async () => {
                      await remove({ id: audience._id });
                      onClose();
                    }}
                  />
                )}
              </div>
            </div>

            <Tabs defaultValue="profile" className="gap-0">
              <TabList className="sticky top-0 z-10 bg-background px-6">
                <Tab value="profile">Profile</Tab>
                <Tab value="culture">Culture</Tab>
                <Tab value="geo">Geo</Tab>
                <Tab value="brief">Brief</Tab>
                <Tab value="trace">Trace</Tab>
                {audience.kind === "csv" && <Tab value="members">Members</Tab>}
              </TabList>
              <div className="min-h-[60svh] bg-neutral-50 px-6 py-6">
                <TabPanel value="profile" className="space-y-5">
                  {profile ? (
                    <>
                      <Panel title="Taste tags" description={`${fmt.int(profile.tags.length)} tags from Qloo, strongest first in each group`}>
                        <TagTable tags={profile.tags} />
                      </Panel>
                      <div className="grid items-start gap-5 lg:grid-cols-2">
                        <Panel title="Brands they trust" description="Affinity out of 100">
                          <BrandsList brands={profile.brands} max={10} />
                        </Panel>
                        <Panel title="Demographics" description="Skew against the Qloo baseline. Right of centre means over-indexed.">
                          <div className="p-4">
                            <DemographicsBars demographics={profile.demographics} />
                          </div>
                        </Panel>
                      </div>
                      <Panel title="Signals" description={`${fmt.int(signals.length)} entities the profile was built from`}>
                        <div className="p-4">
                          <EntityStrip
                            items={signals.map((e) => ({ ...e, subtitle: e.count ? `${e.count} members` : e.type.replace("urn:entity:", "") }))}
                            max={24}
                          />
                        </div>
                      </Panel>
                    </>
                  ) : (
                    <EmptyPanel icon={Hourglass} title="Not compiled yet">The profile appears once compilation finishes.</EmptyPanel>
                  )}
                </TabPanel>
                <TabPanel value="culture">
                  <CultureLists culture={profile?.culture} max={8} />
                </TabPanel>
                <TabPanel value="geo" className="space-y-5">
                  {geoCity && (
                    <CityMap
                      city={{ name: geoCity.name, country: audience.sources.location?.country ?? "", countryCode: "", lat: geoCity.lat!, lon: geoCity.lon! }}
                    />
                  )}
                  {profile?.geo.length ? (
                    <Panel title="Where they are" description={`${fmt.int(profile.geo.length)} places`}>
                      <GeoList geo={profile.geo} />
                    </Panel>
                  ) : (
                    <EmptyPanel icon={MapPinOff} title="Not tied to a place">
                      {audience.kind === "interests" || audience.kind === "demographic"
                        ? "This audience is defined by taste, not location, so it reaches people wherever they are. City audiences and customer clusters show where their people live."
                        : "No location data yet. It appears once the audience compiles."}
                    </EmptyPanel>
                  )}
                </TabPanel>
                <TabPanel value="brief">
                  <AudienceBriefView brief={brief} />
                </TabPanel>
                <TabPanel value="trace">
                  <Panel title="Trace" description="Every call made while compiling this audience">
                    <div className="p-4">
                      <TraceList spans={audience.trace} />
                    </div>
                  </Panel>
                </TabPanel>
                {audience.kind === "csv" && (
                  <TabPanel value="members">
                    <MembersTable audience={audience} />
                  </TabPanel>
                )}
              </div>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** A titled white panel on the drawer's tinted background. */
function Panel({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      <header className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </header>
      {children}
    </section>
  );
}

function EmptyPanel({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed bg-card px-6 py-12 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-muted">
        <Icon className="size-4 text-muted-foreground" />
      </span>
      <p className="mt-3 text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

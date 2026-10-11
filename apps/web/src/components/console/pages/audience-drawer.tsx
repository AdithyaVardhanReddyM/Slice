"use client";

import { useMutation, useQuery } from "convex/react";
import { Link2, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
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
import { AudienceBriefView, BrandsList, CultureLists, DemographicsBars, GeoList, TagsByGroup } from "./profile-view";
import { EntityStrip, Hint, ProgressLine, SectionLabel, StatusBadge, TraceList, audienceSizeLabel } from "./shared";

/* Members (CSV clusters) ----------------------------------------------------------- */

function PersonalLink({ member }: { member: Member }) {
  const brand = useBrand();
  const createLead = useMutation(api.pagesUploads.createLead);
  const run = useCompileAudience();
  const pages = useQuery(api.pages.list, { brandId: brand._id }) as Page[] | undefined;
  const [busy, setBusy] = useState(false);
  const published = (pages ?? []).filter((p) => p.status === "published");
  const hasLead = !!member.leadAudienceId;

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
            Opens any published page as a version written for this one person. The first visit builds their profile from their row.
          </p>
        </div>
        {!hasLead ? (
          <Button size="sm" onClick={make} disabled={busy}>
            {busy && <Spinner data-icon="inline-start" />}
            Create their audience
          </Button>
        ) : published.length === 0 ? (
          <Hint>Publish a page first; the link is ?g={member._id} on any page.</Hint>
        ) : (
          <ul className="space-y-2">
            {published.map((p) => {
              const url = publicPageUrl(brand.slug, p.slug, { g: member._id });
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

  return (
    <Sheet open={!!audience} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
        {audience && (
          <>
            <SheetHeader>
              <div className="flex flex-wrap items-center gap-2 pr-8">
                <SheetTitle>{audience.name}</SheetTitle>
                <Badge variant="outline">{AUDIENCE_KIND_LABEL[audience.kind] ?? audience.kind}</Badge>
                <StatusBadge status={audience.status} />
              </div>
              <SheetDescription>
                {audienceSizeLabel(audience)}
                {audience.sources.location ? ` · ${audience.sources.location.city}` : ""}
                {audience.sources.interests?.length ? ` · ${audience.sources.interests.slice(0, 4).join(", ")}` : ""}
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-5 px-4 pb-6">
              {audience.status !== "ready" && <ProgressLine progress={audience.progress} status={audience.status} error={audience.error} />}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => void run(audience._id)} disabled={audience.status === "compiling"}>
                  <RefreshCw data-icon="inline-start" /> Recompile
                </Button>
                <Button variant="outline" size="sm" onClick={() => void writeBrief(audience._id)} disabled={briefBusy || !profile}>
                  {briefBusy ? <Spinner data-icon="inline-start" /> : null}
                  {brief ? "Rewrite brief" : "Write brief"}
                </Button>
                {audience.kind !== "default" && (
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" size="sm" className="text-destructive">
                        <Trash2 data-icon="inline-start" /> Delete
                      </Button>
                    }
                    title={`Delete ${audience.name}?`}
                    description="Pages that target this audience lose that version. This cannot be undone."
                    actionLabel="Delete audience"
                    onConfirm={async () => {
                      await remove({ id: audience._id });
                      onClose();
                    }}
                  />
                )}
              </div>

              <Tabs defaultValue="profile">
                <TabList className="mb-4">
                  <Tab value="profile">Profile</Tab>
                  <Tab value="culture">Culture</Tab>
                  <Tab value="geo">Geo</Tab>
                  <Tab value="brief">Brief</Tab>
                  <Tab value="trace">Trace</Tab>
                  {audience.kind === "csv" && <Tab value="members">Members</Tab>}
                </TabList>
                <TabPanel value="profile" className="space-y-6">
                  {profile ? (
                    <>
                      <section className="space-y-2">
                        <SectionLabel>Taste tags</SectionLabel>
                        <TagsByGroup tags={profile.tags} />
                      </section>
                      <div className="grid gap-6 lg:grid-cols-2">
                        <section className="space-y-2">
                          <SectionLabel>Brands they trust</SectionLabel>
                          <BrandsList brands={profile.brands} max={10} />
                        </section>
                        <section className="space-y-2">
                          <SectionLabel>Demographics</SectionLabel>
                          <DemographicsBars demographics={profile.demographics} />
                          <Hint>Skew against the Qloo baseline. Right of centre means over-indexed.</Hint>
                        </section>
                      </div>
                      <section className="space-y-2">
                        <SectionLabel>Signals ({fmt.int(profile.entities.length)})</SectionLabel>
                        <EntityStrip items={profile.entities.map((e) => ({ ...e, subtitle: e.count ? `${e.count} members` : e.type.replace("urn:entity:", "") }))} max={24} />
                      </section>
                    </>
                  ) : (
                    <Hint>The profile appears once compilation finishes.</Hint>
                  )}
                </TabPanel>
                <TabPanel value="culture">
                  <CultureLists culture={profile?.culture} max={8} />
                </TabPanel>
                <TabPanel value="geo">
                  <GeoList geo={profile?.geo} />
                </TabPanel>
                <TabPanel value="brief">
                  <AudienceBriefView brief={brief} />
                </TabPanel>
                <TabPanel value="trace">
                  <TraceList spans={audience.trace} />
                </TabPanel>
                {audience.kind === "csv" && (
                  <TabPanel value="members">
                    <MembersTable audience={audience} />
                  </TabPanel>
                )}
              </Tabs>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

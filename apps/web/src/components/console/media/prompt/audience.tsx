"use client";

// Who the prompts are for, in the strip on top of the prompt bar: everyone (the
// brand's own taste) or one audience. Audiences come from where the brand
// came from, read live: a Pages brand's audiences, an Email brand's taste
// groups. New ones are made the same way as there (the Pages audience sheet,
// Email's customer import) and so land in both. A brand made in Media gets the
// same Pages audience sheet; its audiences live under a Pages brand of its own
// that no Pages screen lists (mediaBrands.audienceHome).

import { useMutation, useQuery } from "convex/react";
import { Check, ChevronDown, Loader2, Plus, Upload, Users, UsersRound, type LucideIcon } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import type { MediaAudience } from "@slice/backend/convex/mediaTypes";
import { AUDIENCE_KIND_LABEL, listedAudiences, type AudienceProfile } from "@/lib/pages/types";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BrandProvider } from "@/components/console/pages/brand-context";
import { NewAudienceSheet, type AudienceSourceKind } from "@/components/console/pages/new-audience-sheet";
import { KIND_ICON, coverTiles } from "@/components/console/pages/taste-cover";
import { audienceSubtitle } from "@/components/console/pages/shared";
import { EmailBrandProvider } from "@/components/console/email/brand-context";
import { ImportContactsSheet } from "@/components/console/email/contacts/import-sheet";
import { useCanvas } from "../canvas/context";

type Status = "ready" | "compiling" | "failed";

interface Option {
  key: string;
  name: string;
  hint?: string;
  image?: string;
  icon: LucideIcon;
  status: Status;
  progress?: string;
  /** What joins the campaign's audiences when it is picked. */
  ref: Omit<MediaAudience, "id">;
}

const EVERYONE: MediaAudience = { id: "all", name: "Everyone", kind: "everyone" };

const slug = (name: string, taken: Set<string>) => {
  const base = `a-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "audience"}`;
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
};

const faceOf = (profile: unknown, own = false) => coverTiles((profile as AudienceProfile | undefined) ?? null, 1, own).find((t) => t.image)?.image;

/** Everything the brand can make for, and the campaign's own described audiences. */
function useAudiences() {
  const { campaign, campaignId, brand, audienceId, setAudienceId } = useCanvas();
  const update = useMutation(api.media.update);
  // A brand made in Media keeps its audiences in a Pages brand of its own, made the first time it needs one.
  const pagesId = brand?.source.pagesBrandId ?? brand?.audienceBrandId;
  const emailId = brand?.source.emailBrandId;
  const pagesBrand = useQuery(api.pagesBrands.get, pagesId ? { id: pagesId } : "skip");
  const emailBrand = useQuery(api.emailBrands.get, emailId ? { id: emailId } : "skip");
  const pagesRows = useQuery(api.pagesAudiences.list, pagesId ? { brandId: pagesId } : "skip");
  const emailRows = useQuery(api.emailAudiences.list, emailId ? { brandId: emailId } : "skip");
  const audiences = campaign.audiences as MediaAudience[];

  // A Pages brand's own default audience is the same idea as Everyone, so it is left out.
  const pages: Option[] = listedAudiences(pagesRows ?? [])
    .filter((a) => a.kind !== "default")
    .map((a) => ({
      key: `pages:${a._id}`,
      name: a.name,
      hint: audienceSubtitle(a) ?? AUDIENCE_KIND_LABEL[a.kind] ?? undefined,
      image: faceOf(a.profile),
      icon: KIND_ICON[a.kind] ?? Users,
      status: a.status as Status,
      progress: a.progress?.label,
      ref: { name: a.name, kind: "pages", pagesAudienceId: a._id, ...(a.brief?.summary ? { summary: String(a.brief.summary).slice(0, 400) } : {}) },
    }));
  // Email's individual contacts are people, not a taste to design for, so only the groups come.
  const email: Option[] = (emailRows ?? [])
    .filter((a) => a.kind === "group")
    .map((a) => ({
      key: `email:${a._id}`,
      name: a.name,
      hint: `${a.size} ${a.size === 1 ? "customer" : "customers"}${a.topEntities.length ? ` who like ${a.topEntities.slice(0, 2).join(" and ")}` : ""}`,
      image: faceOf(a.profile, true),
      icon: UsersRound,
      status: a.status,
      progress: a.progress?.label,
      ref: { name: a.name, kind: "email", emailAudienceId: a._id, ...(a.brief?.summary ? { summary: a.brief.summary.slice(0, 400) } : {}) },
    }));
  const described: Option[] = audiences
    .filter((a) => a.kind === "seed")
    .map((a) => ({ key: `seed:${a.id}`, name: a.name, hint: a.seed?.interests?.join(", "), icon: Users, status: "ready", ref: a }));

  /** The live row behind one of the campaign's audiences (face, name, status), while it still exists. */
  const liveOf = (a: MediaAudience) => (a.pagesAudienceId ? pages.find((o) => o.ref.pagesAudienceId === a.pagesAudienceId) : a.emailAudienceId ? email.find((o) => o.ref.emailAudienceId === a.emailAudienceId) : described.find((o) => o.key === `seed:${a.id}`));
  const current = audiences.find((a) => a.id === audienceId) ?? EVERYONE;
  const live = liveOf(current);

  const add = async (a: Omit<MediaAudience, "id">) => {
    const id = slug(a.name, new Set(audiences.map((x) => x.id)));
    // Everyone stays first; past six, the oldest picked audience makes room.
    const everyone = audiences.find((x) => x.kind === "everyone") ?? EVERYONE;
    const rest = [...audiences.filter((x) => x.kind !== "everyone"), { ...a, id }].slice(-5);
    await update({ id: campaignId, audiences: [everyone, ...rest] });
    setAudienceId(id);
  };

  /** Make it the one the prompts are for, adding it to the campaign the first time. */
  const choose = (o: Option | null) => {
    if (!o) return setAudienceId("all");
    const have = audiences.find((a) => (o.ref.pagesAudienceId && a.pagesAudienceId === o.ref.pagesAudienceId) || (o.ref.emailAudienceId && a.emailAudienceId === o.ref.emailAudienceId) || (o.key === `seed:${a.id}`));
    if (have) return setAudienceId(have.id);
    void add(o.ref);
  };

  return { pages, email, described, audiences, current, live, liveOf, choose, pagesBrand, emailBrand, loading: (!!pagesId && pagesRows === undefined) || (!!emailId && emailRows === undefined) };
}

/** Who a piece on the canvas was made for, in the strip while its own conversation is open. It is part of what the piece is, so not a picker. */
export function MadeForPill({ audienceKey }: { audienceKey?: string }) {
  const { audiences, liveOf } = useAudiences();
  const made = audiences.find((a) => a.id === audienceKey) ?? EVERYONE;
  const everyone = made.id === "all";
  const live = everyone ? undefined : liveOf(made);
  return (
    <span title="Who it was made for" className="inline-flex h-8 max-w-full min-w-0 items-center gap-2 rounded-full pr-2.5 pl-1 text-[13px]">
      <Face image={live?.image} icon={everyone ? Users : (live?.icon ?? Users)} />
      <span className="shrink-0 text-neutral-500">Made for</span>
      <span className="truncate font-semibold text-neutral-900">{live?.name ?? made.name}</span>
    </span>
  );
}

function Face({ image, icon: Icon, className }: { image?: string; icon: LucideIcon; className?: string }) {
  return image ? (
    // Qloo and brand images live on their own hosts.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={image} alt="" className={cn("size-6 shrink-0 rounded-full object-cover ring-1 ring-black/[0.06]", className)} />
  ) : (
    <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full bg-orange-50 text-orange-700 ring-1 ring-orange-200/60", className)}>
      <Icon className="size-3.5" />
    </span>
  );
}

function Row({ option, on, onPick }: { option: Option; on: boolean; onPick: () => void }) {
  const busy = option.status === "compiling";
  const failed = option.status === "failed";
  return (
    <button type="button" disabled={failed} onClick={onPick} className={cn("flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-neutral-100 disabled:pointer-events-none disabled:opacity-50", on && "bg-neutral-100")}>
      <Face image={option.image} icon={option.icon} className="size-8" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{option.name}</span>
        <span className="block truncate text-xs text-muted-foreground">{failed ? "Couldn't read its taste" : busy ? (option.progress ?? "Reading its taste") : option.hint}</span>
      </span>
      {busy ? <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" /> : on && <Check className="size-4 shrink-0" />}
    </button>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t border-neutral-100 p-1.5">
      <p className="px-2 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

/** The selector in the prompt bar's top strip, its picker, and the sheets that make new audiences. */
export function AudiencePill() {
  const { brand, notify } = useCanvas();
  const { pages, email, described, current, live, choose, pagesBrand, emailBrand, loading } = useAudiences();
  const audienceHome = useMutation(api.mediaBrands.audienceHome);
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState<"pages" | "email" | null>(null);
  const [pagesKind, setPagesKind] = useState<AudienceSourceKind | null>(null);
  const everyone = current.id === "all";
  const busy = live?.status === "compiling";
  // Where new audiences are made: Pages for a Pages brand, Email's import for an Email brand, else the brand's own store.
  const maker = !brand ? null : brand.source.pagesBrandId ? "pages" : brand.source.emailBrandId ? "email" : "own";
  // Made when the picker opens, so the sheet has it by the time New audience is clicked.
  const home = useRef<Promise<unknown> | null>(null);
  const ensureHome = () => {
    if (maker !== "own" || !brand || brand.audienceBrandId) return Promise.resolve();
    home.current ??= audienceHome({ id: brand._id }).catch((err) => {
      home.current = null;
      throw err;
    });
    return home.current;
  };
  const make = async (s: "pages" | "email") => {
    setOpen(false);
    setPagesKind(null);
    try {
      await ensureHome();
    } catch {
      return notify("Couldn't start a new audience. Try again.", "bad");
    }
    setSheet(s);
  };

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (o) ensureHome().catch(() => undefined);
        }}
      >
        <PopoverTrigger
          title="Who it is for"
          className="inline-flex h-8 max-w-full min-w-0 items-center gap-2 rounded-full pr-2 pl-1 text-[13px] transition-colors hover:bg-black/[0.04] data-popup-open:bg-black/[0.05]"
        >
          <Face image={everyone ? undefined : live?.image} icon={everyone ? Users : (live?.icon ?? Users)} />
          <span className="shrink-0 text-neutral-500">For</span>
          <span className="truncate font-semibold text-neutral-900">{live?.name ?? current.name}</span>
          {busy && <Loader2 className="size-3.5 shrink-0 animate-spin text-neutral-400" />}
          <ChevronDown className="size-3.5 shrink-0 text-neutral-400" />
        </PopoverTrigger>
        <PopoverContent side="top" align="start" sideOffset={8} className="w-[360px] gap-0 overflow-hidden p-0">
          <div className="px-3.5 pt-3 pb-2.5">
            <p className="text-sm font-semibold">Who is it for?</p>
            <p className="text-xs text-muted-foreground">Slice shapes the pictures, words and music to their taste.</p>
          </div>
          <div className="max-h-[min(60vh,480px)] overflow-y-auto overscroll-contain">
            <div className="border-t border-neutral-100 p-1.5">
              <Row option={{ key: "all", name: "Everyone", hint: "The brand's own taste", icon: Users, status: "ready", ref: EVERYONE }} on={everyone} onPick={() => (choose(null), setOpen(false))} />
            </div>
            {pagesBrand && (
              <Group title={maker === "own" ? "Audiences" : `${pagesBrand.name} in Pages`}>
                {pages.map((o) => (
                  <Row key={o.key} option={o} on={o.ref.pagesAudienceId === current.pagesAudienceId} onPick={() => (choose(o), setOpen(false))} />
                ))}
                {!loading && pages.length === 0 && <p className="px-2 pb-1.5 text-xs text-muted-foreground">{maker === "own" ? "No audiences yet." : "No audiences in Pages yet."}</p>}
              </Group>
            )}
            {emailBrand && (
              <Group title={`${emailBrand.name} in Email`}>
                {email.map((o) => (
                  <Row key={o.key} option={o} on={o.ref.emailAudienceId === current.emailAudienceId} onPick={() => (choose(o), setOpen(false))} />
                ))}
                {!loading && email.length === 0 && <p className="px-2 pb-1.5 text-xs text-muted-foreground">No taste groups in Email yet. Import customers and Email groups them by what they buy.</p>}
              </Group>
            )}
            {described.length > 0 && (
              <Group title="Described here">
                {described.map((o) => (
                  <Row key={o.key} option={o} on={o.key === `seed:${current.id}`} onPick={() => (choose(o), setOpen(false))} />
                ))}
              </Group>
            )}
          </div>
          {maker && (
            <div className="border-t border-neutral-100 p-1.5">
              {maker === "email" ? (
                <button type="button" onClick={() => void make("email")} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-neutral-100">
                  <Upload className="size-4 text-neutral-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">Import customers</span>
                    <span className="block text-xs text-muted-foreground">Email groups them by taste; the groups show up here</span>
                  </span>
                </button>
              ) : (
                <button type="button" onClick={() => void make("pages")} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-neutral-100">
                  <Plus className="size-4 text-neutral-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">New audience</span>
                    <span className="block text-xs text-muted-foreground">{maker === "pages" ? "Made in Pages, so it is there too" : "Who they are and what they love, read by Qloo"}</span>
                  </span>
                </button>
              )}
            </div>
          )}
        </PopoverContent>
      </Popover>

      {pagesBrand && (
        <BrandProvider value={pagesBrand}>
          <NewAudienceSheet
            open={sheet === "pages"}
            kind={pagesKind}
            onOpenChange={(o) => !o && setSheet(null)}
            onKindChange={setPagesKind}
            onCreated={(id, name) => choose({ key: `pages:${id}`, name, icon: Users, status: "compiling", ref: { name, kind: "pages", pagesAudienceId: id } })}
            description="Who is it for? Pick where the audience comes from; Qloo turns it into a taste profile Slice designs for."
          />
        </BrandProvider>
      )}
      {emailBrand && (
        <EmailBrandProvider value={emailBrand}>
          <ImportContactsSheet open={sheet === "email"} onOpenChange={(o) => !o && setSheet(null)} />
        </EmailBrandProvider>
      )}
    </>
  );
}

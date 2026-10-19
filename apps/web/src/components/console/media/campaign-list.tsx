"use client";

// The Media home: every campaign as a card headed by the plain Media artwork
// (nothing laid over it), and "New campaign", which opens a fresh canvas
// straight away.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ArrowRight, Loader2, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import type { MediaKit } from "@slice/backend/convex/mediaTypes";
import { cn } from "@/lib/utils";
import { PageHeader, Skeleton } from "@/components/console/primitives";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MediaFrame } from "./media-frame";
import { usd } from "./prompt/options";

type Row = NonNullable<ReturnType<typeof useQuery<typeof api.media.list>>>[number];

const ago = (at: number) => {
  const s = Math.round((Date.now() - at) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.round(s / 86400)} d ago`;
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

function CampaignMenu({ row }: { row: Row }) {
  const remove = useMutation(api.media.remove);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Campaign options"
          onClick={(e) => e.preventDefault()}
          className="absolute top-3 right-3 z-10 flex size-8 items-center justify-center rounded-full bg-white/90 text-neutral-600 opacity-0 shadow-sm ring-1 ring-black/[0.06] backdrop-blur transition-opacity group-hover:opacity-100 hover:text-neutral-950 focus-visible:opacity-100 data-popup-open:opacity-100"
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem variant="destructive" onClick={() => setConfirm(true)}>
            <Trash2 /> Delete campaign
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete “{row.name}”?</DialogTitle>
            <DialogDescription>Everything on its canvas goes with it: posters, videos, images, clips, music and the chat. The brand stays.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await remove({ id: row._id });
                setConfirm(false);
              }}
            >
              {busy && <Loader2 className="animate-spin" />} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CampaignCard({ row }: { row: Row }) {
  const kit = row.kit as MediaKit | undefined;
  const made = row.images + row.posters + row.videos + row.clips + row.tracks;
  return (
    <div className="group relative">
      <CampaignMenu row={row} />
      <Link
        href={`/dashboard/media/${row._id}`}
        className="flex h-full flex-col overflow-hidden rounded-2xl bg-card shadow-[0_1px_2px_rgba(20,20,20,0.04),0_10px_28px_-16px_rgba(20,20,20,0.10)] ring-1 ring-black/[0.05] transition-shadow hover:shadow-lg"
      >
        <MediaFrame className="border-b border-black/[0.05]" hoverZoom />
        <div className="flex flex-1 flex-col gap-4 p-5">
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold tracking-tight text-neutral-950">{row.name}</h3>
            <p className="truncate text-sm text-muted-foreground">
              {kit?.name && kit.name !== "Your brand" ? kit.name : "No brand yet"} · {ago(row.updatedAt)}
            </p>
          </div>
          <dl className="grid grid-cols-3 gap-3 border-t border-black/[0.05] pt-4">
            {(
              [
                ["Images", row.images],
                ["Posters", row.posters],
                ["Video", row.videos + row.clips],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="truncate text-xs text-muted-foreground">{label}</dt>
                <dd className="num mt-0.5 text-sm font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-auto flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span className="truncate">{made ? `${made} on the canvas` : "Empty canvas"}</span>
            <span className="flex items-center gap-2">
              <span className="text-xs tabular-nums" title="Model spend at list prices">
                {usd(row.spend)}
              </span>
              <ArrowRight className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
}

/** Make a campaign and open its canvas. */
function useNewCampaign() {
  const router = useRouter();
  const create = useMutation(api.media.createBlank);
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    try {
      const id = await create({});
      router.push(`/dashboard/media/${id}`);
    } catch {
      setBusy(false);
    }
  };
  return { start, busy };
}

function NoCampaigns() {
  const { start, busy } = useNewCampaign();
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center py-10 text-center">
      <MediaFrame className="mb-10 w-full max-w-xl rounded-3xl ring-1 ring-black/[0.05]" priority sizes="576px" />
      <h2 className="text-2xl font-medium tracking-[-0.02em] text-neutral-950">Images, posters, video and music, on brand</h2>
      <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-muted-foreground">
        Open a canvas, pick your brand and say what you need. Slice makes it in your look and voice with the latest Google models, and checks every picture against your guidelines.
      </p>
      <Button className="mt-8 h-10 rounded-full px-5" disabled={busy} onClick={() => void start()}>
        {busy ? <Loader2 className="animate-spin" /> : <Plus />} Start a campaign
      </Button>
    </div>
  );
}

export function MediaCampaignList() {
  const { isAuthenticated } = useConvexAuth();
  const rows = useQuery(api.media.list, isAuthenticated ? {} : "skip");
  const { start, busy } = useNewCampaign();
  const total = (rows ?? []).reduce((s, r) => s + r.spend, 0);
  return (
    <>
      <PageHeader
        title="Media"
        description="Each campaign is a canvas: images, posters, clips, video ads and music for one brand."
        actions={
          <div className="flex items-center gap-3">
            {rows && rows.length > 0 && (
              <span className="text-xs text-muted-foreground tabular-nums" title="Model spend across all campaigns, at list prices">
                {usd(total)} spent
              </span>
            )}
            <Button className="h-9 rounded-full px-4" disabled={busy} onClick={() => void start()}>
              {busy ? <Loader2 className="animate-spin" /> : <Plus />} New campaign
            </Button>
          </div>
        }
      />
      {rows === undefined ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[26rem] rounded-2xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <NoCampaigns />
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => (
            <CampaignCard key={r._id} row={r} />
          ))}
          <button
            type="button"
            disabled={busy}
            onClick={() => void start()}
            className={cn("group/new flex min-h-[26rem] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-black/15 px-8 text-center text-muted-foreground transition-colors hover:border-black/30 hover:bg-white hover:text-foreground", busy && "opacity-60")}
          >
            <span className="flex size-11 items-center justify-center rounded-full bg-neutral-100 transition-colors group-hover/new:bg-white group-hover/new:shadow-sm">{busy ? <Loader2 className="size-5 animate-spin" /> : <Plus className="size-5" />}</span>
            <span className="text-sm font-medium">New campaign</span>
            <span className="max-w-60 text-xs leading-relaxed">Opens a blank canvas. Pick a brand and ask for what you need.</span>
          </button>
        </div>
      )}
    </>
  );
}

/** /dashboard/media/new: make a campaign and go straight to its canvas. */
export function NewCampaign() {
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const create = useMutation(api.media.createBlank);
  const started = useRef(false);
  useEffect(() => {
    if (!isAuthenticated || started.current) return;
    started.current = true;
    void create({}).then((id) => router.replace(`/dashboard/media/${id}`));
  }, [isAuthenticated, create, router]);
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#f6f5f3]">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  );
}

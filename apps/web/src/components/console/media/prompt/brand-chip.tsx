"use client";

// The brand the agent designs for, as a chip in the prompt bar: switch to
// another brand, edit this one's guidelines, or add a new one.

import { useMutation, useQuery } from "convex/react";
import { Check, ChevronDown, PenLine, Plus } from "lucide-react";
import { useState } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Doc, Id } from "@slice/backend/convex/_generated/dataModel";
import type { MediaKit } from "@slice/backend/convex/mediaTypes";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCanvas } from "../canvas/context";
import { BrandDialog, brandHost } from "./brand-dialog";
import { chipClass } from "./menus";

/** A brand's logo on its own background, or its initial in its primary colour. */
export function BrandMark({ kit, name, className }: { kit: MediaKit | undefined; name: string; className?: string }) {
  const logo = kit?.logo?.src;
  return (
    <span className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-[5px] ring-1 ring-black/[0.08]", className)} style={{ background: logo ? (kit?.logo?.onDark ? kit.colors.foreground : kit?.colors.background) : kit?.colors.primary ?? "#171717" }}>
      {logo ? (
        // Brand logos live on the brands' hosts and Convex storage.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className="max-h-[70%] max-w-[80%] object-contain" />
      ) : (
        <span className="text-[10px] font-semibold" style={{ color: kit?.colors.primaryForeground ?? "#fff" }}>
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}
    </span>
  );
}

export function BrandChip() {
  const { brand, campaignId } = useCanvas();
  const brands = useQuery(api.mediaBrands.list, {});
  const setBrand = useMutation(api.media.setBrand);
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<{ open: boolean; id: Id<"mediaBrands"> | null }>({ open: false, id: null });
  const pick = (b: Doc<"mediaBrands">) => {
    setOpen(false);
    if (b._id !== brand?._id) void setBrand({ id: campaignId, brandId: b._id });
  };
  const none = !brand;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className={cn(chipClass, "pl-1.5", none && "bg-orange-50 text-orange-800 ring-orange-200 hover:bg-orange-50")} title="Brand">
          {brand ? <BrandMark kit={brand.kit as MediaKit} name={brand.name} className="h-5 w-7" /> : <Plus className="ml-1" />}
          <span className="max-w-32 truncate @max-[520px]:hidden">{brand?.name ?? "Add your brand"}</span>
          <ChevronDown className="text-neutral-400 @max-[520px]:hidden" />
        </PopoverTrigger>
        <PopoverContent side="top" align="start" className="w-80 gap-1 p-1.5">
          <p className="px-2 pt-1 pb-1.5 text-xs font-medium text-muted-foreground">Designing for</p>
          {(brands ?? []).map((b) => (
            <button key={b._id} type="button" onClick={() => pick(b)} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-neutral-100">
              <BrandMark kit={b.kit as MediaKit} name={b.name} className="h-7 w-10" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{b.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{b.status === "reading" ? "Reading its website…" : brandHost(b.url) || "Set up by hand"}</span>
              </span>
              {b._id === brand?._id && <Check className="size-4" />}
            </button>
          ))}
          {brands?.length === 0 && <p className="px-2 py-2 text-sm text-muted-foreground">No brands yet. Add one so everything Slice makes looks and sounds like it.</p>}
          <div className="my-1 h-px bg-border" />
          {brand && (
            <button type="button" onClick={() => (setOpen(false), setDialog({ open: true, id: brand._id }))} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-neutral-100">
              <PenLine className="size-4 text-muted-foreground" /> Edit {brand.name}&apos;s guidelines
            </button>
          )}
          <button type="button" onClick={() => (setOpen(false), setDialog({ open: true, id: null }))} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-neutral-100">
            <Plus className="size-4 text-muted-foreground" /> New brand
          </button>
        </PopoverContent>
      </Popover>
      <BrandDialog
        open={dialog.open}
        brandId={dialog.id}
        onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}
        onDone={(id) => {
          if (id !== brand?._id) void setBrand({ id: campaignId, brandId: id });
        }}
      />
    </>
  );
}

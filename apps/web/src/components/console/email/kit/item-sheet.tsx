"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { Fingerprint, ImageOff, Trash2, X } from "lucide-react";
import { api } from "@slice/backend/convex/_generated/api";
import { ITEM_KINDS, errorText } from "@/lib/email/labels";
import type { EmailBrand, EmailItemRow } from "@/lib/email/types";
import { Input, Select, Textarea } from "@/components/console/form";
import { Spinner, TokenInput } from "@/components/console/setup/atoms";
import { ConfirmDialog } from "@/components/console/settings/confirm-dialog";
import { EditorField } from "@/components/console/pages/editor-layout";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { UploadImage } from "./upload-image";

type Fields = { name: string; subtitle: string; kind: string; description: string; price: string; image: string; url: string; tags: string[] };

const blank = (kind: string): Fields => ({ name: "", subtitle: "", kind, description: "", price: "", image: "", url: "", tags: [] });

function fieldsOf(item: EmailItemRow): Fields {
  return {
    name: item.name,
    subtitle: item.subtitle ?? "",
    kind: item.kind,
    description: item.description,
    price: item.price ?? "",
    image: item.image ?? "",
    url: item.url ?? "",
    tags: item.tags,
  };
}

function Cover({ src }: { src: string }) {
  const [broken, setBroken] = useState<string | null>(null);
  if (!src || broken === src)
    return (
      <span className="flex size-full items-center justify-center text-muted-foreground">
        <ImageOff className="size-5" />
      </span>
    );
  // Covers and product photos live on many hosts; next/image would need each allow-listed.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className="size-full object-cover" onError={() => setBroken(src)} />;
}

/** Add or edit one item. `item` null with `open` adds a new one. */
export function ItemSheet({
  brand,
  item,
  open,
  defaultKind,
  onOpenChange,
}: {
  brand: EmailBrand;
  item: EmailItemRow | null;
  open: boolean;
  defaultKind: string;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useMutation(api.emailItems.create);
  const update = useMutation(api.emailItems.update);
  const remove = useMutation(api.emailItems.remove);
  const [fields, setFields] = useState<Fields>(() => (item ? fieldsOf(item) : blank(defaultKind)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const set = (patch: Partial<Fields>) => setFields((f) => ({ ...f, ...patch }));
  const book = fields.kind === "book";

  async function save() {
    if (!fields.name.trim()) {
      setError("Give the item a name");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (item) await update({ id: item._id, ...fields });
      else
        await create({
          brandId: brand._id,
          name: fields.name,
          kind: fields.kind,
          description: fields.description,
          tags: fields.tags,
          ...(fields.subtitle ? { subtitle: fields.subtitle } : {}),
          ...(fields.price ? { price: fields.price } : {}),
          ...(fields.image ? { image: fields.image } : {}),
          ...(fields.url ? { url: fields.url } : {}),
        });
      onOpenChange(false);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto data-[side=right]:sm:max-w-xl">
        <SheetHeader className="border-b px-6 py-5">
          <SheetTitle>{item ? item.name : "Add an item"}</SheetTitle>
          <SheetDescription>What the brand sells or offers. Taste picks and items blocks show it with its picture, price and link.</SheetDescription>
        </SheetHeader>
        <div className="grid gap-5 px-6 py-6">
          <div className="flex gap-4">
            <span className={book ? "aspect-[2/3] w-28 shrink-0 overflow-hidden rounded-lg bg-neutral-100 ring-1 ring-black/[0.06]" : "aspect-square w-28 shrink-0 overflow-hidden rounded-lg bg-neutral-100 ring-1 ring-black/[0.06]"}>
              <Cover src={fields.image} />
            </span>
            <div className="min-w-0 flex-1 space-y-2">
              <EditorField label={book ? "Cover" : "Picture"} aside="Optional">
                <Input value={fields.image} onChange={(e) => set({ image: e.target.value })} placeholder="https://…" inputMode="url" />
              </EditorField>
              <div className="flex gap-2">
                <UploadImage label={fields.image ? "Replace" : "Upload"} onUploaded={(url) => set({ image: url })} />
                {fields.image && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => set({ image: "" })}>
                    <X data-icon="inline-start" /> Remove
                  </Button>
                )}
              </div>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
            <EditorField label="Name">
              <Input value={fields.name} onChange={(e) => set({ name: e.target.value })} placeholder={book ? "The Overstory" : "Linen tote"} autoFocus={!item} />
            </EditorField>
            <EditorField label="Kind">
              <Select value={fields.kind} onChange={(e) => set({ kind: e.target.value })}>
                {ITEM_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </Select>
            </EditorField>
          </div>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
            <EditorField label={book ? "Author" : "Subtitle"} aside="Optional">
              <Input value={fields.subtitle} onChange={(e) => set({ subtitle: e.target.value })} placeholder={book ? "Richard Powers" : "Maker, brand or date"} />
            </EditorField>
            <EditorField label="Price" aside="Optional">
              <Input value={fields.price} onChange={(e) => set({ price: e.target.value })} placeholder="$18.00" />
            </EditorField>
          </div>
          <EditorField label="Description" hint="A line or two in your own words. The builder quotes from it.">
            <Textarea rows={3} value={fields.description} onChange={(e) => set({ description: e.target.value })} />
          </EditorField>
          <EditorField label="Link" aside="Optional" hint="Where the button in an email goes.">
            <Input value={fields.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://" inputMode="url" />
          </EditorField>
          <EditorField label="Tags" hint="Words that help match taste: genres, styles, moods.">
            <TokenInput values={fields.tags} onChange={(tags) => set({ tags })} placeholder="Literary fiction" />
          </EditorField>
          {item?.qloo && (
            <div className="flex items-start gap-3 rounded-xl bg-neutral-50 p-3 ring-1 ring-black/[0.05]">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white ring-1 ring-black/[0.06]">
                <Fingerprint className="size-4" />
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <div className="font-medium">Matched on Qloo: {item.qloo.name}</div>
                <p className="text-xs text-muted-foreground">
                  {item.qloo.type.replace("urn:entity:", "")}
                  {item.qloo.tags?.length ? `, tagged ${item.qloo.tags.slice(0, 5).join(", ")}` : ""}
                </p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => update({ id: item._id, qloo: null }).catch((err) => setError(errorText(err)))}>
                Clear
              </Button>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <SheetFooter className="mt-auto flex-row items-center justify-between border-t px-6 py-4">
          {item ? (
            <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirming(true)}>
              <Trash2 data-icon="inline-start" /> Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={save} disabled={busy}>
              {busy && <Spinner data-icon="inline-start" />}
              {item ? "Save item" : "Add item"}
            </Button>
          </div>
        </SheetFooter>
        {item && (
          <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            title={`Delete ${item.name}?`}
            description="It leaves the catalog, and emails that featured it skip it from now on. Sent campaigns keep what they sent."
            actionLabel="Delete item"
            onConfirm={() => {
              void remove({ id: item._id })
                .then(() => onOpenChange(false))
                .catch((err) => setError(errorText(err)));
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

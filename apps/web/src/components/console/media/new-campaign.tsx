"use client";

// "New campaign" asks which brand it is for first: the brands already in
// Media, then the Pages and Email brands not copied here yet (picking one
// copies it, so its audiences come along). "New brand" sets one up from a
// website or by hand. The canvas opens once the campaign has its brand.

import { useMutation, useQuery } from "convex/react";
import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BrandDialog, SourceRow, brandHost } from "./prompt/brand-dialog";

type Kit = { logo?: { src?: string }; colors?: { primary: string; accent: string; background: string } };

const look = (kit: unknown) => {
  const k = kit as Kit | undefined;
  return { logo: k?.logo?.src, colors: k?.colors ? [k.colors.primary, k.colors.accent, k.colors.background] : undefined };
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h3 className="text-sm font-medium">{title}</h3>
      <div className="grid gap-2.5 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function NewCampaignDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const media = useQuery(api.mediaBrands.list, open ? {} : "skip");
  const pages = useQuery(api.pagesBrands.list, open ? {} : "skip");
  const email = useQuery(api.emailBrands.list, open ? {} : "skip");
  const create = useMutation(api.media.createBlank);
  const importBrand = useMutation(api.mediaBrands.importBrand);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [making, setMaking] = useState(false);

  const start = async (key: string, brand: () => Promise<Id<"mediaBrands">>) => {
    setBusy(key);
    setError(null);
    try {
      const id = await create({ brandId: await brand() });
      router.push(`/dashboard/media/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  };

  // A Pages or Email brand already copied into Media is offered once, as that copy.
  const copied = new Set((media ?? []).flatMap((b) => [b.source.pagesBrandId, b.source.emailBrandId].filter(Boolean) as string[]));
  const fromPages = (pages ?? []).filter((b) => b.kit && !copied.has(b._id));
  const fromEmail = (email ?? []).filter((b) => b.kit && !copied.has(b._id));
  const loading = media === undefined || pages === undefined || email === undefined;
  const none = !loading && !media.length && !fromPages.length && !fromEmail.length;
  const origin = (b: NonNullable<typeof media>[number]) => {
    const host = brandHost(b.url);
    if (b.status === "reading") return "Reading its website…";
    const made = b.source.kind === "pages" ? "from Pages" : b.source.kind === "email" ? "from Email" : "made in Media";
    return host ? `${host}, ${made}` : made.charAt(0).toUpperCase() + made.slice(1);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="border-b p-6">
            <DialogTitle>New campaign</DialogTitle>
            <DialogDescription>Which brand is it for? Everything Slice makes on the canvas follows its look, its voice and its audiences.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[min(60vh,560px)] space-y-6 overflow-y-auto bg-neutral-50/60 p-6">
            {loading ? (
              <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
            ) : none ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No brands yet. Add one from its website and Slice reads its look and voice.</p>
            ) : (
              <>
                {media.length > 0 && (
                  <Section title="Your brands">
                    {media.map((b) => (
                      <SourceRow key={b._id} name={b.name} sub={origin(b)} {...look(b.kit)} busy={busy === b._id} onClick={() => void start(b._id, async () => b._id)} />
                    ))}
                  </Section>
                )}
                {fromPages.length > 0 && (
                  <Section title="From Pages">
                    {fromPages.map((b) => (
                      <SourceRow key={b._id} name={b.name} sub={brandHost(b.url)} {...look(b.kit)} busy={busy === b._id} onClick={() => void start(b._id, () => importBrand({ pagesBrandId: b._id }))} />
                    ))}
                  </Section>
                )}
                {fromEmail.length > 0 && (
                  <Section title="From Email">
                    {fromEmail.map((b) => (
                      <SourceRow key={b._id} name={b.name} sub={brandHost(b.url)} {...look(b.kit)} busy={busy === b._id} onClick={() => void start(b._id, () => importBrand({ emailBrandId: b._id }))} />
                    ))}
                  </Section>
                )}
              </>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <div className="flex items-center justify-between gap-3 border-t p-4">
            <Button
              variant="outline"
              disabled={!!busy}
              onClick={() => {
                onOpenChange(false);
                setMaking(true);
              }}
            >
              <Plus /> New brand
            </Button>
            <Button variant="ghost" disabled={!!busy} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <BrandDialog open={making} onOpenChange={setMaking} onDone={(id) => void start("new", async () => id)} />
    </>
  );
}

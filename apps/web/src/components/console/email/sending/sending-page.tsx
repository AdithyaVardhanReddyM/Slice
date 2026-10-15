"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Check, FlaskConical, Globe, Send, ShieldCheck, type LucideIcon } from "lucide-react";
import { api } from "@slice/backend/convex/_generated/api";
import { fillMergePlain } from "@slice/backend/convex/emailRender";
import type { EmailSender, SendingMode } from "@slice/backend/convex/emailTypes";
import { cn } from "@/lib/utils";
import { defaultSender, senderDomain } from "@/lib/email/kit";
import { SENDING_MODE, errorText, isResendMissing } from "@/lib/email/labels";
import { brandTheme, templateIdFor, themedTemplate } from "@/lib/email/render-context";
import { campaignAt, docOf, domainOf, kitOf, senderOf, type CampaignRow, type EmailBrand } from "@/lib/email/types";
import { PageHeader, Panel, PanelHeader, Skeleton } from "@/components/console/primitives";
import { ConsolePage } from "@/components/console/shell-ui";
import { Spinner } from "@/components/console/setup/atoms";
import { Button } from "@/components/ui/button";
import { useEmailBrand } from "../brand-context";
import { SenderFields } from "../kit/editors";
import { PhoneInbox } from "../phone";
import { DomainPanel } from "./domain-panel";
import { ResendMissing } from "./resend-missing";

const MODE: Record<SendingMode, { icon: LucideIcon; tile: string; title: (domain?: string) => string }> = {
  demo: { icon: FlaskConical, tile: "bg-neutral-900 text-white", title: () => "Sends are simulated" },
  domain: { icon: ShieldCheck, tile: "bg-emerald-50 text-emerald-700", title: (d) => (d ? `Live from ${d}` : "Live from your domain") },
  shared: { icon: Globe, tile: "bg-emerald-50 text-emerald-700", title: () => "Live from Slice's shared domain" },
  none: { icon: Send, tile: "bg-amber-50 text-amber-700", title: () => "Only test emails go out" },
};

/** Where campaigns go today, in one line. */
function DeliveryStatus({ brand }: { brand: EmailBrand }) {
  const info = useQuery(api.emailBrands.sendingInfo, { id: brand._id });
  if (info === undefined) return <Skeleton className="h-[5.5rem] rounded-2xl" />;
  const mode = MODE[info.mode];
  const missingKey = isResendMissing(info.reason) && !brand.demo;
  const body =
    info.mode === "demo"
      ? `${brand.name} is a demo brand, so nothing leaves Slice. Deliveries, opens and clicks are simulated so the reports move.`
      : info.reason && !missingKey
        ? info.reason
        : SENDING_MODE[info.mode].summary;
  return (
    <Panel>
      <div className="flex items-start gap-4 p-5">
        <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", mode.tile)}>
          <mode.icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-semibold tracking-tight text-neutral-950">{mode.title(domainOf(brand)?.name)}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">{body}</p>
        </div>
      </div>
      {missingKey && <ResendMissing className="mx-5 mb-5" />}
    </Panel>
  );
}

/** The sender being edited, shared by the form and the inbox preview so the phone follows every keystroke. */
function useSenderDraft(brand: EmailBrand) {
  const update = useMutation(api.emailBrands.update);
  const stored = senderOf(brand) ?? defaultSender(brand.name);
  const [sender, setSender] = useState<EmailSender>(stored);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Follow saves made elsewhere (the brand kit's Sender tab) while nothing is being edited here.
  const [seen, setSeen] = useState(brand.sender);
  if (seen !== brand.sender) {
    setSeen(brand.sender);
    if (!dirty) setSender(stored);
  }

  return {
    sender,
    dirty,
    busy,
    saved,
    error,
    change(s: EmailSender) {
      setSender(s);
      setDirty(true);
      setSaved(false);
    },
    discard() {
      setSender(stored);
      setDirty(false);
      setError(null);
    },
    async save() {
      setBusy(true);
      setError(null);
      try {
        await update({
          id: brand._id,
          sender: { fromName: sender.fromName.trim() || brand.name, fromLocal: sender.fromLocal || "hello", ...(sender.replyTo ? { replyTo: sender.replyTo } : {}) },
        });
        setDirty(false);
        setSaved(true);
        window.setTimeout(() => setSaved(false), 2000);
      } catch (err) {
        setError(errorText(err));
      } finally {
        setBusy(false);
      }
    },
  };
}

type SenderDraft = ReturnType<typeof useSenderDraft>;

function SenderPanel({ brand, draft }: { brand: EmailBrand; draft: SenderDraft }) {
  return (
    <Panel>
      <PanelHeader title="Sender" hint="The name and address every campaign comes from" />
      <div className="p-5">
        <SenderFields className="md:grid-cols-2" sender={draft.sender} domain={senderDomain({ ...brand, domain: domainOf(brand) })} onChange={draft.change} />
      </div>
      <footer className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-t border-black/[0.05] bg-neutral-50/70 px-5 py-2.5">
        <p className={cn("text-[13px]", draft.error ? "text-destructive" : "text-muted-foreground")}>
          {draft.error ?? (draft.dirty ? "You have unsaved changes." : "A campaign takes the sender saved when it starts sending.")}
        </p>
        {draft.dirty ? (
          <div className="flex gap-2">
            <Button variant="ghost" className="rounded-full px-3 text-muted-foreground" onClick={draft.discard} disabled={draft.busy}>
              Discard
            </Button>
            <Button className="rounded-full px-4" onClick={draft.save} disabled={draft.busy}>
              {draft.busy && <Spinner data-icon="inline-start" />}
              Save sender
            </Button>
          </div>
        ) : (
          draft.saved && (
            <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <Check className="size-4 text-emerald-600" /> Saved
            </span>
          )
        )}
      </footer>
    </Panel>
  );
}

/** A phone on the brand's own colour, showing how the next campaign lands in Mail with the sender as edited. */
function InboxPreview({ brand, sender }: { brand: EmailBrand; sender: EmailSender }) {
  const kit = kitOf(brand);
  const theme = useMemo(() => brandTheme(kit), [kit]);
  const campaigns = useQuery(api.emailCampaigns.list, { brandId: brand._id }) as CampaignRow[] | undefined;
  // The latest campaign when there is one, else the welcome email every brand starts with.
  const doc = useMemo(() => {
    const latest = [...(campaigns ?? [])].sort((a, b) => campaignAt(b) - campaignAt(a))[0];
    const id = templateIdFor("welcome");
    return (latest && docOf(latest)) ?? (id ? themedTemplate(id, kit) : null);
  }, [campaigns, kit]);
  const merge = { brand: brand.name };
  const fromName = sender.fromName.trim() || brand.name;
  const address = `${sender.fromLocal || "hello"}@${senderDomain({ ...brand, domain: domainOf(brand) })}`;

  return (
    <Panel className="lg:sticky lg:top-[5.5rem]">
      <PanelHeader title="In the inbox" hint="How your campaigns land, as you edit the sender" />
      <div
        className="relative h-[25rem] overflow-hidden"
        style={{
          background: `radial-gradient(90% 70% at 100% 0%, color-mix(in oklab, ${theme.colors.primary} 28%, transparent), transparent 70%), ${theme.colors.accent}`,
        }}
      >
        <div className="absolute inset-x-0 top-8 flex justify-center">
          <PhoneInbox
            width={290}
            mail={{
              from: fromName,
              subject: doc ? fillMergePlain(doc.subject, merge) : "",
              preheader: doc ? fillMergePlain(doc.preheader, merge) : "",
              mark: kit?.icon ?? kit?.logo?.src,
              color: kit?.colors.primary,
            }}
          />
        </div>
      </div>
      <dl className="divide-y divide-black/[0.05] border-t border-black/[0.05] text-sm">
        <div className="px-5 py-3">
          <dt className="text-xs text-muted-foreground">From</dt>
          <dd className="mt-0.5 truncate font-medium" title={`${fromName} <${address}>`}>
            {fromName} <span className="font-normal text-muted-foreground">&lt;{address}&gt;</span>
          </dd>
        </div>
        <div className="px-5 py-3">
          <dt className="text-xs text-muted-foreground">Replies go to</dt>
          <dd className="mt-0.5 truncate font-medium">{sender.replyTo || address}</dd>
        </div>
      </dl>
    </Panel>
  );
}

export function SendingPage() {
  const brand = useEmailBrand();
  const draft = useSenderDraft(brand);
  return (
    <ConsolePage>
      <PageHeader title="Sending" description="Who your campaigns come from, and the domain that lets them reach real inboxes." />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <DeliveryStatus brand={brand} />
          <SenderPanel brand={brand} draft={draft} />
          <DomainPanel brand={brand} />
        </div>
        <InboxPreview brand={brand} sender={draft.sender} />
      </div>
    </ConsolePage>
  );
}

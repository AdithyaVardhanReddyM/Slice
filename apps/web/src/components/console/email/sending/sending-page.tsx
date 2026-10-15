"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Check, FlaskConical, Globe, Send, ShieldCheck, type LucideIcon } from "lucide-react";
import { api } from "@slice/backend/convex/_generated/api";
import type { EmailSender, SendingMode } from "@slice/backend/convex/emailTypes";
import { cn } from "@/lib/utils";
import { defaultSender, senderDomain } from "@/lib/email/kit";
import { SENDING_MODE, errorText, isResendMissing } from "@/lib/email/labels";
import { domainOf, senderOf, type EmailBrand } from "@/lib/email/types";
import { PageHeader, Panel, PanelHeader, Skeleton } from "@/components/console/primitives";
import { ConsolePage } from "@/components/console/shell-ui";
import { Spinner } from "@/components/console/setup/atoms";
import { Button } from "@/components/ui/button";
import { useEmailBrand } from "../brand-context";
import { SenderFields } from "../kit/editors";
import { DomainPanel } from "./domain-panel";
import { ResendMissing } from "./resend-missing";

const MODE_ICON: Record<SendingMode, LucideIcon> = { demo: FlaskConical, domain: ShieldCheck, shared: Globe, none: Send };

/** Where campaigns can go today, and the three ways a brand sends. */
function ModeCard({ brand }: { brand: EmailBrand }) {
  const info = useQuery(api.emailBrands.sendingInfo, { id: brand._id });
  // The shared domain only shows when it is what this brand uses; the other three always explain themselves.
  const modes: SendingMode[] = info?.mode === "shared" ? ["demo", "shared", "domain", "none"] : ["demo", "domain", "none"];
  const CurrentIcon = MODE_ICON[info?.mode ?? "none"];
  return (
    <Panel>
      <PanelHeader title="How this brand sends" hint="Fixed for a campaign when it starts sending" />
      <div className="space-y-5 p-5">
        {info === undefined ? (
          <Skeleton className="h-16 rounded-xl" />
        ) : (
          <div className="flex flex-wrap items-start gap-4 rounded-2xl bg-neutral-50 p-4 ring-1 ring-black/[0.04]">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-neutral-900 text-white">
              <CurrentIcon className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-muted-foreground">{SENDING_MODE[info.mode].label}</p>
              <p className="mt-0.5 truncate text-lg font-medium tracking-tight text-neutral-950">{info.from}</p>
              <p className="mt-1 text-sm text-muted-foreground">{info.reason && !isResendMissing(info.reason) ? info.reason : SENDING_MODE[info.mode].summary}</p>
            </div>
          </div>
        )}
        {info?.reason && isResendMissing(info.reason) && !brand.demo && <ResendMissing />}
        <ul className={cn("grid gap-3", modes.length === 4 ? "md:grid-cols-4" : "md:grid-cols-3")}>
          {modes.map((m) => {
            const Icon = MODE_ICON[m];
            const current = info?.mode === m;
            return (
              <li key={m} className={cn("rounded-2xl p-4 ring-1 transition-colors", current ? "bg-white ring-2 ring-neutral-900" : "bg-white ring-black/[0.06]")}>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-neutral-100">
                    <Icon className="size-4" />
                  </span>
                  {current && (
                    <span className="inline-flex h-6 items-center gap-1 rounded-full bg-neutral-900 px-2 text-xs font-medium text-white">
                      <Check className="size-3" /> Now
                    </span>
                  )}
                </div>
                <p className="mt-3 text-sm font-medium">{SENDING_MODE[m].label}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{SENDING_MODE[m].summary}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </Panel>
  );
}

function SenderPanel({ brand }: { brand: EmailBrand }) {
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

  async function save() {
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
  }

  return (
    <Panel>
      <PanelHeader
        title="Sender"
        hint="Who your campaigns come from"
        actions={
          saved ? (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Check className="size-4 text-emerald-600" /> Saved
            </span>
          ) : (
            <Button size="sm" className="rounded-full px-3" onClick={save} disabled={!dirty || busy}>
              {busy && <Spinner data-icon="inline-start" />}
              Save
            </Button>
          )
        }
      />
      <div className="p-5">
        <SenderFields
          sender={sender}
          domain={senderDomain({ ...brand, domain: domainOf(brand) })}
          onChange={(s) => {
            setSender(s);
            setDirty(true);
            setSaved(false);
          }}
        />
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      </div>
    </Panel>
  );
}

export function SendingPage() {
  const brand = useEmailBrand();
  return (
    <ConsolePage className="space-y-6">
      <PageHeader title="Sending" description="Who your campaigns come from, and the domain that lets them reach real inboxes." />
      <ModeCard brand={brand} />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <DomainPanel brand={brand} />
        <SenderPanel brand={brand} />
      </div>
    </ConsolePage>
  );
}

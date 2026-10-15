"use client";

// Preview: the real email HTML (rendered on the server the way it is sent,
// without tracking) at desktop and phone width, under its inbox line, as
// anyone or as one person of the audience (their merge values and, for a
// customer list, their own version).

import { useQuery } from "convex/react";
import { Monitor, Smartphone } from "lucide-react";
import { useState } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/console/setup/atoms";
import { EmailFrame } from "@/components/console/email/email-frame";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { fieldClass } from "./fields";

type Device = "desktop" | "phone" | "both";

interface Rendered {
  html: string;
  subject: string;
  preheader: string;
}

function Inbox({ from, subject, preheader, width }: { from: string; subject: string; preheader: string; width: number }) {
  return (
    <div className="mx-auto mb-3 flex items-start gap-3 rounded-xl bg-white px-3.5 py-2.5 shadow-sm ring-1 ring-black/[0.05]" style={{ maxWidth: width }}>
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white">{from.charAt(0).toUpperCase()}</span>
      <div className="min-w-0 flex-1 text-sm">
        <div className="truncate text-xs font-semibold text-neutral-950">{from}</div>
        <div className="truncate font-medium text-neutral-950">{subject || <span className="text-muted-foreground">No subject yet</span>}</div>
        {preheader && <div className="truncate text-muted-foreground">{preheader}</div>}
      </div>
    </div>
  );
}

function Frame({ html, width, phone }: { html: string | undefined; width: number; phone?: boolean }) {
  return (
    <div className={cn("mx-auto overflow-hidden bg-white shadow-sm ring-1 ring-black/[0.06]", phone ? "rounded-[28px] ring-[6px] ring-neutral-900" : "rounded-lg")} style={{ maxWidth: width }}>
      {html ? (
        <EmailFrame key={width} html={html} width={width} scale="fit" lazy={false} title={phone ? "Phone preview" : "Desktop preview"} />
      ) : (
        <div className="flex h-96 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" /> Rendering
        </div>
      )}
    </div>
  );
}

export function PreviewDialog({
  open,
  onOpenChange,
  campaignId,
  audienceId,
  from,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: Id<"emailCampaigns">;
  audienceId?: Id<"emailAudiences">;
  /** The sender name the inbox line shows. */
  from: string;
}) {
  const [device, setDevice] = useState<Device>("both");
  const [contactId, setContactId] = useState<Id<"emailContacts"> | "">("");
  const rendered = useQuery(api.emailCampaigns.renderFor, open ? { id: campaignId, mode: "preview", ...(contactId ? { contactId } : {}) } : "skip") as Rendered | undefined;
  const contacts = useQuery(api.emailContacts.byAudience, open && audienceId ? { audienceId } : "skip") as { _id: Id<"emailContacts">; name: string; email: string; unsubscribed?: boolean }[] | undefined;
  const people = (contacts ?? []).filter((c) => !c.unsubscribed);

  const options: { value: Device; label: string; icon?: typeof Monitor }[] = [
    { value: "desktop", label: "Desktop", icon: Monitor },
    { value: "phone", label: "Phone", icon: Smartphone },
    { value: "both", label: "Both" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100dvh-3rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl">
        <div className="flex flex-wrap items-center gap-3 border-b px-5 py-3 pr-12">
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-[15px] font-semibold">Preview</DialogTitle>
            <DialogDescription className="truncate">The email as inboxes get it, with links and merge tags filled in.</DialogDescription>
          </div>
          {people.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              As
              <select value={contactId} onChange={(e) => setContactId(e.target.value as Id<"emailContacts"> | "")} className={cn(fieldClass, "h-8 w-48 text-sm")}>
                <option value="">Anyone (sample values)</option>
                {people.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div role="radiogroup" aria-label="Device" className="inline-flex h-8 items-center rounded-full bg-neutral-100 p-0.5">
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={device === o.value}
                onClick={() => setDevice(o.value)}
                className={cn("inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-neutral-600 transition-colors", device === o.value && "bg-white text-neutral-950 shadow-sm")}
              >
                {o.icon && <o.icon className="size-3.5" />}
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto bg-canvas px-6 py-6">
          {device === "both" ? (
            <div className="mx-auto grid max-w-5xl items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
              <div>
                <Inbox from={from} subject={rendered?.subject ?? ""} preheader={rendered?.preheader ?? ""} width={600} />
                <Frame html={rendered?.html} width={600} />
              </div>
              <div className="hidden lg:block">
                <Frame html={rendered?.html} width={375} phone />
              </div>
            </div>
          ) : (
            <>
              <Inbox from={from} subject={rendered?.subject ?? ""} preheader={rendered?.preheader ?? ""} width={device === "phone" ? 375 : 600} />
              <Frame html={rendered?.html} width={device === "phone" ? 375 : 600} phone={device === "phone"} />
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

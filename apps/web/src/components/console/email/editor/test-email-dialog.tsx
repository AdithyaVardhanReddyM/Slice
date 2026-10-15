"use client";

// Test email: send the email as it stands to an inbox (the merchant's own by
// default), optionally as one recipient so their merge values and the version
// they get (their taste group's, or their own) show.

import { useUser } from "@clerk/nextjs";
import { useAction, useQuery } from "convex/react";
import { CheckCircle2, Info, Send } from "lucide-react";
import { useState } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { errorText, isResendMissing } from "@/lib/email/labels";
import { Spinner } from "@/components/console/setup/atoms";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ChevronSelect, fieldClass } from "./fields";
import { RecipientOptions } from "./preview-dialog";

type State = { kind: "idle" } | { kind: "sending" } | { kind: "sent"; to: string; from: string } | { kind: "error"; message: string };

export function TestEmailDialog({
  open,
  onOpenChange,
  campaignId,
  beforeSend,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: Id<"emailCampaigns">;
  /** Save pending edits first, so the test is the email on screen. */
  beforeSend?: () => Promise<void>;
}) {
  const { user } = useUser();
  const mine = user?.primaryEmailAddress?.emailAddress ?? "";
  const [to, setTo] = useState("");
  const [contactId, setContactId] = useState<Id<"emailContacts"> | "">("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const sendTest = useAction(api.emailSend.sendTest);
  const contacts = useQuery(api.emailCampaigns.recipients, open ? { id: campaignId } : "skip");
  const people = (contacts ?? []).filter((c) => !c.unsubscribed);
  const address = (to || mine).trim();

  async function send() {
    if (!address) return;
    setState({ kind: "sending" });
    try {
      await beforeSend?.();
      const res = await sendTest({ campaignId, to: address, ...(contactId ? { contactId } : {}) });
      setState({ kind: "sent", to: address, from: res.from });
    } catch (err) {
      setState({ kind: "error", message: errorText(err) });
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setState({ kind: "idle" });
      }}
    >
      <DialogContent className="gap-4 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send a test email</DialogTitle>
          <DialogDescription>See it in a real inbox before it goes out. Tests are not counted in the report.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="test-to">Send to</Label>
            <input
              id="test-to"
              type="email"
              value={to}
              placeholder={mine || "you@example.com"}
              onChange={(e) => setTo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void send()}
              className={cn(fieldClass, "h-9 text-sm")}
            />
          </div>
          {people.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="test-as">Send it as</Label>
              <ChevronSelect id="test-as" value={contactId} onChange={(e) => setContactId(e.target.value as Id<"emailContacts"> | "")} className="h-9 w-full">
                <option value="">Anyone (sample values)</option>
                <RecipientOptions people={people} />
              </ChevronSelect>
              <p className="text-xs text-muted-foreground">Their first name, city and the version they get: their taste group&apos;s, or their own.</p>
            </div>
          )}
          {state.kind === "sent" && (
            <div className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900 ring-1 ring-emerald-600/15">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              <span>
                Sent to {state.to} from {state.from}. It can take a minute to arrive; check spam if it does not.
              </span>
            </div>
          )}
          {state.kind === "error" && (
            <div className={cn("flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ring-1", isResendMissing(state.message) ? "bg-neutral-50 text-neutral-800 ring-black/10" : "bg-destructive/5 text-destructive ring-destructive/15")}>
              <Info className="mt-0.5 size-4 shrink-0" />
              <span>{isResendMissing(state.message) ? "Sending isn't set up yet: add a Resend API key to the Convex environment, then try again." : state.message}</span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {state.kind === "sent" ? "Done" : "Cancel"}
          </Button>
          <Button onClick={() => void send()} disabled={!address || state.kind === "sending"} className="bg-neutral-900 text-white hover:bg-neutral-800">
            {state.kind === "sending" ? <Spinner className="size-4" /> : <Send data-icon="inline-start" />}
            {state.kind === "sent" ? "Send again" : "Send test"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

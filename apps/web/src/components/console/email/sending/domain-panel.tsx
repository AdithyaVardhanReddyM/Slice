"use client";

import { useRef, useState, type FormEvent } from "react";
import { useAction } from "convex/react";
import { Check, CircleAlert, CircleCheck, Clock, Copy, FlaskConical, Globe, RefreshCw, ShieldCheck, Unplug } from "lucide-react";
import { api } from "@slice/backend/convex/_generated/api";
import type { DnsRecord } from "@slice/backend/convex/emailTypes";
import { cn } from "@/lib/utils";
import { DOMAIN_STATUS, errorText, isResendMissing, recordStatus, relativeTime, type Tone } from "@/lib/email/labels";
import { domainOf, type EmailBrand } from "@/lib/email/types";
import { AdornedInput, Notice, Spinner } from "@/components/console/setup/atoms";
import { ConfirmDialog } from "@/components/console/settings/confirm-dialog";
import { Panel, PanelHeader } from "@/components/console/primitives";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { hostOf } from "../brand-shell";
import { ResendMissing } from "./resend-missing";

const CONNECT_STEPS = [
  ["Connect it", "Slice registers the domain with Resend, our sending provider."],
  ["Add the records", "Copy the DNS records Slice lists into your domain provider."],
  ["Verify", "Once the records check out, campaigns go to real inboxes."],
] as const;

const TONE_ICON: Record<Tone, typeof Check> = { ok: CircleCheck, warn: Clock, bad: CircleAlert, neutral: Clock, outline: Clock };
const TONE_CLASS: Record<Tone, string> = {
  ok: "bg-emerald-50 text-emerald-700",
  warn: "bg-amber-50 text-amber-800",
  bad: "bg-red-50 text-red-700",
  neutral: "bg-neutral-100 text-neutral-700",
  outline: "bg-neutral-100 text-neutral-600",
};

/** Status as words with an icon, never a dot. */
export function StatusPill({ label, tone, className }: { label: string; tone: Tone; className?: string }) {
  const Icon = TONE_ICON[tone];
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-medium", TONE_CLASS[tone], className)}>
      <Icon className="size-3.5" />
      {label}
    </span>
  );
}

function CopyValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label={copied ? "Copied" : `Copy ${label}`}
      className="shrink-0 text-muted-foreground hover:text-foreground"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
        } catch {
          // Clipboard can be blocked (insecure origin, permissions); the check still confirms the click.
        }
        setCopied(true);
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check /> : <Copy />}
    </Button>
  );
}

function RecordsTable({ records }: { records: DnsRecord[] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-24 pl-5">Type</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Value</TableHead>
            <TableHead className="w-20 text-right">Priority</TableHead>
            <TableHead className="w-32 pr-5">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((r, i) => {
            const s = recordStatus(r.status);
            return (
              <TableRow key={`${r.record}-${r.name}-${i}`} className="align-top hover:bg-neutral-50/60">
                <TableCell className="pl-5">
                  <span className="block font-medium">{r.type}</span>
                  <span className="block text-xs text-muted-foreground">{r.record}</span>
                </TableCell>
                <TableCell className="max-w-48">
                  <span className="flex items-start gap-1">
                    <code className="min-w-0 font-mono text-xs leading-6 break-all whitespace-normal">{r.name}</code>
                    <CopyValue value={r.name} label="name" />
                  </span>
                </TableCell>
                <TableCell className="max-w-[28rem] min-w-64">
                  <span className="flex items-start gap-1">
                    <code className="line-clamp-3 min-w-0 font-mono text-xs leading-6 break-all whitespace-normal" title={r.value}>
                      {r.value}
                    </code>
                    <CopyValue value={r.value} label="value" />
                  </span>
                </TableCell>
                <TableCell className="num text-right">{r.priority ?? "—"}</TableCell>
                <TableCell className="pr-5">
                  <StatusPill label={s.label} tone={s.tone} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/** Connect the brand's domain in Resend, show the DNS records to add, verify and refresh. */
export function DomainPanel({ brand }: { brand: EmailBrand }) {
  const connect = useAction(api.emailDomains.connect);
  const verify = useAction(api.emailDomains.verify);
  const refresh = useAction(api.emailDomains.refresh);
  const disconnect = useAction(api.emailDomains.disconnect);
  const domain = domainOf(brand);
  // Suggest the site's own domain, never a dev host like localhost:3002.
  const [name, setName] = useState(() => {
    const host = hostOf(brand.url);
    return /^(localhost|127\.|\[::1\])|\.localhost(:|$)|:\d+$/.test(host) ? "" : host;
  });
  const [busy, setBusy] = useState<"connect" | "verify" | "refresh" | "disconnect" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function run(kind: NonNullable<typeof busy>, fn: () => Promise<unknown>) {
    setBusy(kind);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    void run("connect", () => connect({ brandId: brand._id, name: name.trim() }));
  }

  const status = domain ? DOMAIN_STATUS[domain.status] : null;
  const verified = domain?.status === "verified";

  return (
    <Panel>
      <PanelHeader
        title="Sending domain"
        hint={domain ? "Add these records at your DNS provider (where you bought the domain), then verify." : "Send from your own address, like hello@yourshop.com."}
        actions={domain && status && <StatusPill label={status.label} tone={status.tone} />}
      />
      {error &&
        (isResendMissing(error) ? (
          <div className="px-5 pt-4">
            <ResendMissing />
          </div>
        ) : (
          <div className="px-5 pt-4">
            <Notice tone="bad">{error}</Notice>
          </div>
        ))}

      {!domain ? (
        <>
          <form onSubmit={submit} className="space-y-6 p-5">
            <div className="space-y-2">
              <label htmlFor="email-domain" className="text-sm font-medium">
                Domain
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <AdornedInput
                  id="email-domain"
                  className="h-10 sm:flex-1"
                  prefix="@"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="yourshop.com"
                  spellCheck={false}
                  inputMode="url"
                />
                <Button type="submit" className="h-10 rounded-full px-5" disabled={!name.trim() || busy !== null}>
                  {busy === "connect" ? <Spinner data-icon="inline-start" /> : <ShieldCheck data-icon="inline-start" />}
                  Connect domain
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">The part after the @ in your email address. Use one you own and can edit the DNS for.</p>
            </div>
            <ol className="grid gap-3 sm:grid-cols-3">
              {CONNECT_STEPS.map(([title, body], i) => (
                <li key={title} className="rounded-xl bg-neutral-50 p-4 ring-1 ring-black/[0.04]">
                  <span className="num flex size-6 items-center justify-center rounded-full bg-white text-xs font-semibold text-neutral-700 ring-1 ring-black/10">{i + 1}</span>
                  <p className="mt-3 text-sm font-medium">{title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{body}</p>
                </li>
              ))}
            </ol>
          </form>
          {brand.demo && (
            <p className="flex items-start gap-2 border-t border-black/[0.05] bg-neutral-50/70 px-5 py-3 text-[13px] text-muted-foreground">
              <FlaskConical className="mt-0.5 size-4 shrink-0" />
              Demo brands simulate their campaigns, so this one doesn&apos;t need a domain. You can still try the flow.
            </p>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Globe className="size-4 text-muted-foreground" />
                <span className="truncate text-lg font-medium tracking-tight">{domain.name}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {status?.hint}
                {domain.checkedAt ? ` Last checked ${relativeTime(domain.checkedAt)}.` : ""}
              </p>
              {domain.error && <p className="mt-1 text-sm text-destructive">{domain.error}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              {!verified && (
                <Button className="rounded-full" onClick={() => run("verify", () => verify({ brandId: brand._id }))} disabled={busy !== null}>
                  {busy === "verify" ? <Spinner data-icon="inline-start" /> : <ShieldCheck data-icon="inline-start" />}
                  Verify
                </Button>
              )}
              <Button variant="outline" className="rounded-full" onClick={() => run("refresh", () => refresh({ brandId: brand._id }))} disabled={busy !== null}>
                {busy === "refresh" ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
                Refresh
              </Button>
              <Button variant="ghost" className="rounded-full text-muted-foreground" onClick={() => setConfirming(true)} disabled={busy !== null}>
                {busy === "disconnect" ? <Spinner data-icon="inline-start" /> : <Unplug data-icon="inline-start" />}
                Disconnect
              </Button>
            </div>
          </div>
          {domain.records.length > 0 ? (
            <div className="border-t border-black/[0.05]">
              <RecordsTable records={domain.records} />
              <p className="border-t border-black/[0.05] px-5 py-3 text-xs text-muted-foreground">
                Leave TTL at your provider&apos;s default. Some providers add the domain to the name for you: if yours does, enter only the part before{" "}
                <code className="font-mono">.{domain.name}</code>.
              </p>
            </div>
          ) : (
            <p className="border-t border-black/[0.05] px-5 py-4 text-sm text-muted-foreground">Resend hasn&apos;t listed the records yet. Refresh in a moment.</p>
          )}
        </>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Disconnect ${domain?.name ?? "the domain"}?`}
        description="It is removed from Resend too. Campaigns can't go to real inboxes until a domain is verified again; test emails still work."
        actionLabel="Disconnect"
        onConfirm={() => void run("disconnect", () => disconnect({ brandId: brand._id }))}
      />
    </Panel>
  );
}

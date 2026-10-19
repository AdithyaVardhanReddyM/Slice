"use client";

import { useCallback, useEffect, useState } from "react";
import { Check } from "lucide-react";
import { fmt } from "@/lib/format";
import type { ParsedCsv } from "@/lib/pages/csv";
import { postJson } from "@/lib/pages/stream";
import { Field, Select } from "@/components/console/form";
import { CRMS, type CrmId } from "@/components/console/pages/crm-logos";
import { Spinner } from "@/components/console/setup/atoms";
import { useEmailBrand } from "@/components/console/email/brand-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// Contacts from HubSpot or Salesforce, through the same Composio pipeline as
// Pages (agent routes /pages/crm/*, one Composio session per brand): sign in
// in a popup, pick a list, read its contacts with their properties. The rows
// then go through the CSV mapping, where the merchant points "What they
// bought or booked" at the property that holds it.

type CrmStatus = Partial<Record<CrmId, { connected: boolean }>>;
type CrmList = { id: string; name: string; size: number | null };

export function CrmImport({ crm, onPulled }: { crm: CrmId; onPulled: (parsed: ParsedCsv, label: string) => void }) {
  const brand = useEmailBrand();
  const chosen = CRMS.find((c) => c.id === crm)!;
  const [status, setStatus] = useState<CrmStatus | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [lists, setLists] = useState<CrmList[] | null>(null);
  const [listId, setListId] = useState("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connected = !!status?.[crm]?.connected;

  const refresh = useCallback(async () => {
    try {
      const res = await postJson<{ ok: boolean; crms?: CrmStatus; error?: string }>("/api/pages/crm/status", { brand_id: brand._id });
      if (!res.ok) throw new Error(res.error ?? "Could not reach Composio");
      setStatus(res.crms ?? {});
      return res.crms ?? {};
    } catch (err) {
      setError(String((err as Error).message ?? err));
      setStatus({});
      return {};
    }
  }, [brand._id]);

  // Whether this brand has the CRM connected yet.
  useEffect(() => {
    let alive = true;
    postJson<{ ok: boolean; crms?: CrmStatus; error?: string }>("/api/pages/crm/status", { brand_id: brand._id })
      .then((res) => {
        if (!alive) return;
        if (!res.ok) throw new Error(res.error ?? "Could not reach Composio");
        setStatus(res.crms ?? {});
      })
      .catch((err) => {
        if (!alive) return;
        setError(String((err as Error).message ?? err));
        setStatus({});
      });
    return () => {
      alive = false;
    };
  }, [brand._id]);

  // While the sign-in popup is open: check when it reports back, and every few seconds meanwhile.
  useEffect(() => {
    if (!connecting) return;
    const check = async () => {
      if ((await refresh())[crm]?.connected) setConnecting(false);
    };
    const onMessage = (e: MessageEvent) => {
      if (e.origin === window.location.origin && (e.data as { type?: string })?.type === "slice:crm-connected") void check();
    };
    window.addEventListener("message", onMessage);
    const timer = setInterval(check, 3000);
    const giveUp = setTimeout(() => setConnecting(false), 180_000);
    return () => {
      window.removeEventListener("message", onMessage);
      clearInterval(timer);
      clearTimeout(giveUp);
    };
  }, [connecting, crm, refresh]);

  useEffect(() => {
    if (!connected) return;
    let alive = true;
    postJson<{ ok: boolean; lists?: CrmList[]; error?: string }>("/api/pages/crm/lists", { brand_id: brand._id, crm })
      .then((res) => {
        if (!alive) return;
        if (!res.ok) throw new Error(res.error ?? "Could not read the lists");
        setLists(res.lists ?? []);
      })
      .catch((err) => alive && setError(String((err as Error).message ?? err)));
    return () => {
      alive = false;
    };
  }, [brand._id, crm, connected]);

  async function connect() {
    setError(null);
    try {
      const res = await postJson<{ ok: boolean; url?: string; error?: string }>("/api/pages/crm/connect", {
        brand_id: brand._id,
        crm,
        callback_url: `${window.location.origin}/crm-connected`,
      });
      if (!res.ok || !res.url) throw new Error(res.error ?? "Could not start the connection");
      window.open(res.url, "slice-crm-connect", "popup,width=560,height=720");
      setConnecting(true);
    } catch (err) {
      setError(String((err as Error).message ?? err));
    }
  }

  async function pull() {
    const list = lists?.find((l) => l.id === listId);
    setBusy(true);
    setError(null);
    try {
      const res = await postJson<{ ok: boolean; columns?: string[]; rows?: Record<string, string>[]; error?: string }>("/api/pages/crm/contacts", {
        brand_id: brand._id,
        crm,
        list_id: listId,
      });
      if (!res.ok) throw new Error(res.error ?? "Could not read the contacts");
      if (!res.rows?.length) throw new Error(`No contacts in ${list?.name ?? "that list"}.`);
      onPulled({ columns: res.columns ?? [], rows: res.rows, delimiter: "," }, `${list?.name ?? "All contacts"} (${chosen.name})`);
    } catch (err) {
      setError(String((err as Error).message ?? err));
    } finally {
      setBusy(false);
    }
  }

  const Logo = chosen.logo;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-2xl border p-4">
        <Logo className="size-9 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{connected ? `${chosen.name} is connected` : `Connect ${chosen.name}`}</div>
          <div className="text-xs text-muted-foreground">
            {connected ? "Through Composio, for this brand only." : "Sign in in the window that opens. Slice never sees a password or token."}
          </div>
        </div>
        {connected ? (
          <Badge variant="secondary">
            <Check /> Connected
          </Badge>
        ) : (
          <Button size="sm" onClick={connect} disabled={connecting || status === null}>
            {(connecting || status === null) && <Spinner data-icon="inline-start" />}
            {connecting ? "Waiting" : "Connect"}
          </Button>
        )}
      </div>
      {connected && (
        <div className="flex items-end gap-3">
          <Field label={crm === "hubspot" ? "List" : "Campaign"} className="min-w-0 flex-1">
            <Select value={listId} disabled={!lists} onChange={(e) => setListId(e.target.value)}>
              {(lists ?? [{ id: "all", name: "Loading lists…", size: null }]).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                  {l.size != null ? ` (${fmt.int(l.size)})` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Button variant="outline" onClick={pull} disabled={!lists || busy}>
            {busy && <Spinner data-icon="inline-start" />}
            Read contacts
          </Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Their properties come in as columns. Point &quot;What they bought or booked&quot; at the one that holds recent orders or bookings.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

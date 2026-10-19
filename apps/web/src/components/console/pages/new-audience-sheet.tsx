"use client";

import { useAction, useMutation } from "convex/react";
import { ArrowLeft, Boxes, Cake, Check, ChevronRight, Compass, FileSpreadsheet, Heart, ListFilter, MapPin, Music, Plug, ShoppingBag, Upload as UploadIcon, Users, UsersRound, X, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/format";
import { MAX_LIST_PEOPLE } from "@slice/backend/convex/pagesTypes";
import { parseCsv, suggestMapping, type CsvMapping, type ParsedCsv } from "@/lib/pages/csv";
import { postJson } from "@/lib/pages/stream";
import type { Audience } from "@/lib/pages/types";
import { Field, Input, Select } from "@/components/console/form";
import { ChoiceCard, ChoiceCardGroup, FieldGroup, Spinner } from "@/components/console/setup/atoms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBrand } from "./brand-context";
import { AudienceBuilder, PRESET_ROWS } from "./audience-builder";
import { CRMS, type CrmId } from "./crm-logos";

const CHUNK = 200;

function Footer({ busy, disabled, label, error, note, onSubmit }: { busy: boolean; disabled: boolean; label: string; error: string | null; note?: string; onSubmit: () => void }) {
  return (
    <div className="sticky bottom-0 -mx-6 mt-auto flex items-center justify-between gap-4 border-t bg-popover px-6 py-4">
      <p className="text-xs text-muted-foreground">
        {error ? <span className="text-destructive">{error}</span> : (note ?? "Takes about 20 seconds. The audience card fills in as Qloo answers.")}
      </p>
      <Button onClick={onSubmit} disabled={busy || disabled}>
        {busy && <Spinner data-icon="inline-start" />}
        {label}
      </Button>
    </div>
  );
}

/* CSV ------------------------------------------------------------------------ */

const ROLES: { key: Exclude<keyof CsvMapping, "taste">; label: string }[] = [
  { key: "id", label: "Customer id" },
  { key: "name", label: "Name" },
  { key: "city", label: "City" },
  { key: "country", label: "Country" },
  { key: "age", label: "Age" },
  { key: "gender", label: "Gender" },
];

type CsvMode = "people" | "clusters";

/** "gwen-customers.csv" → "Gwen customers". */
const listName = (filename: string) => {
  const base = filename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : "Customers";
};

/** Where imported rows came from when it is not a file: a CRM list pulled through Composio. */
type CrmSource = { crm: CrmId; listId: string; listName: string };

/**
 * The mapping, the cluster-or-not choice and the upload, for rows from a CSV
 * or from a CRM list. Remount it (key) when the rows change.
 */
function RowsImport({
  parsed,
  filename,
  defaultName,
  source,
  pickError,
  onDone,
}: {
  parsed: ParsedCsv | null;
  filename: string;
  defaultName: string;
  source?: CrmSource;
  pickError?: string | null;
  onDone: () => void;
}) {
  const brand = useBrand();
  const createUpload = useMutation(api.pagesUploads.create);
  const appendRows = useMutation(api.pagesUploads.appendRows);
  const process = useAction(api.pagesUploads.process);
  // CRM rows carry the contact's id in crm_id: it is what the builder and the write-back look up.
  const [mapping, setMapping] = useState<CsvMapping>(() => (parsed ? { ...suggestMapping(parsed.columns), ...(source ? { id: "crm_id" } : {}) } : { taste: [] }));
  // A short list reads best one by one; a long one in clusters.
  const [mode, setMode] = useState<CsvMode>(() => (parsed && parsed.rows.length <= MAX_LIST_PEOPLE ? "people" : "clusters"));
  const [name, setName] = useState(defaultName);
  const [k, setK] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const noun = source ? "list" : "file";
  const verb = source ? "Import" : "Upload";

  const sample = useMemo(() => parsed?.rows.slice(0, 5) ?? [], [parsed]);
  const toggleTaste = (c: string) => setMapping((m) => ({ ...m, taste: m.taste.includes(c) ? m.taste.filter((x) => x !== c) : [...m.taste, c] }));
  const setRole = (key: (typeof ROLES)[number]["key"], col: string) =>
    setMapping((m) => ({ ...m, [key]: col || undefined, taste: m.taste.filter((t) => t !== col) }));

  async function submit() {
    if (!parsed) return;
    setBusy(source ? "Importing contacts" : "Uploading rows");
    setError(null);
    try {
      const rows = parsed.rows;
      const { id } = await createUpload({
        brandId: brand._id,
        filename,
        columns: parsed.columns,
        rows: rows.slice(0, CHUNK),
        mapping,
        mode,
        ...(mode === "people" ? { name: name.trim() || defaultName } : {}),
        ...(source ? { source } : {}),
      });
      for (let i = CHUNK; i < rows.length; i += CHUNK) {
        setBusy(`${source ? "Importing" : "Uploading"} rows ${fmt.int(i)} of ${fmt.int(rows.length)}`);
        await appendRows({ uploadId: id, rows: rows.slice(i, i + CHUNK) });
      }
      onDone();
      // The long part runs server-side; the audiences screen follows the upload's progress.
      process({ uploadId: id, ...(mode === "clusters" && k ? { k: Number(k) } : {}) })
        .then(({ people }) =>
          people
            ? Promise.all(people.map((p) => postJson("/api/pages/audience-brief", { audience_id: p }).catch(() => undefined)))
            : postJson("/api/pages/name-clusters", { upload_id: id }).catch(() => undefined),
        )
        .catch(() => undefined);
    } catch (err) {
      setError(String((err as Error).message ?? err));
      setBusy(null);
    }
  }

  return (
    <>
      {parsed && (
        <>
          <FieldGroup
            label={source ? "Taste properties" : "Taste columns"}
            hint={
              source
                ? "Pick every property that holds things people like, such as custom properties for favourite artists, brands or interests."
                : "Multi-value cells split on ; , or |. Pick every column that holds things people like."
            }
            aside={`${mapping.taste.length} selected`}
          >
            <div className="flex flex-wrap gap-1.5">
              {parsed.columns.map((c) => {
                const on = mapping.taste.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleTaste(c)}
                    className={cn(
                      "inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs transition-colors",
                      on ? "border-primary/40 bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {on && <Check className="size-3" />}
                    {c}
                  </button>
                );
              })}
            </div>
          </FieldGroup>
          <div className="grid gap-3 sm:grid-cols-3">
            {ROLES.map((r) => (
              <Field key={r.key} label={r.label} optional>
                <Select value={mapping[r.key] ?? ""} onChange={(e) => setRole(r.key, e.target.value)}>
                  <option value="">Not in {noun}</option>
                  {parsed.columns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>
          <FieldGroup label="Cluster them?">
            <ChoiceCardGroup value={mode} onValueChange={setMode} className="sm:grid-cols-2" aria-label="Cluster them?">
              <ChoiceCard
                value="people"
                icon={<UsersRound className="size-4" />}
                title="No, one by one"
                description={
                  parsed.rows.length > MAX_LIST_PEOPLE
                    ? `For lists of up to ${MAX_LIST_PEOPLE} people. This ${noun} has ${fmt.int(parsed.rows.length)}.`
                    : "Each person gets their own taste profile. In the builder, type @ and a name to write a page for one of them."
                }
                disabled={parsed.rows.length > MAX_LIST_PEOPLE}
              />
              <ChoiceCard
                value="clusters"
                icon={<Boxes className="size-4" />}
                title="Yes, in clusters"
                description="People with similar taste are grouped into a few audiences, each with one shared profile. Best for long lists."
              />
            </ChoiceCardGroup>
          </FieldGroup>
          {mode === "people" ? (
            <Field label="List name" hint="One card on the Audiences page holds everyone in the list.">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={defaultName} />
            </Field>
          ) : (
            <Field label="Number of clusters" optional hint="Leave empty to pick 2 to 4 automatically.">
              <Select value={k} onChange={(e) => setK(e.target.value)}>
                <option value="">Automatic</option>
                {[2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  {parsed.columns.map((c) => (
                    <TableHead key={c} className="whitespace-nowrap">
                      <span className="flex items-center gap-1.5">
                        {c}
                        {mapping.taste.includes(c) && <Badge variant="secondary">taste</Badge>}
                        {ROLES.filter((r) => mapping[r.key] === c).map((r) => (
                          <Badge key={r.key} variant="outline">
                            {r.label.toLowerCase()}
                          </Badge>
                        ))}
                      </span>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sample.map((row, i) => (
                  <TableRow key={i}>
                    {parsed.columns.map((c) => (
                      <TableCell key={c} className="max-w-56 truncate text-xs">
                        {row[c]}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
      <Footer
        busy={!!busy}
        disabled={!parsed || mapping.taste.length === 0}
        label={busy ?? (mode === "people" ? `${verb} the list` : `${verb} and cluster`)}
        error={error ?? pickError ?? null}
        note={mode === "people" && parsed ? "Qloo reads one person at a time, about 15 seconds each. The list's card fills in as it goes." : undefined}
        onSubmit={submit}
      />
    </>
  );
}

function CsvTab({ onDone }: { onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; parsed: ParsedCsv } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(f: File) {
    setError(null);
    const parsed = parseCsv(await f.text());
    if (parsed.columns.length === 0 || parsed.rows.length === 0) {
      setError("That file has no rows. Export it as CSV with a header row.");
      return;
    }
    setFile({ name: f.name, parsed });
  }

  const parsed = file?.parsed ?? null;
  return (
    <div className="flex flex-1 flex-col gap-5">
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv,text/plain"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
        }}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) void onFile(f);
        }}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-8 text-center transition-colors hover:bg-muted/50",
          parsed && "border-solid bg-muted/30",
        )}
      >
        <UploadIcon className="size-5 text-muted-foreground" />
        {file && parsed ? (
          <>
            <span className="text-sm font-medium">{file.name}</span>
            <span className="text-xs text-muted-foreground">
              {fmt.int(parsed.rows.length)} rows · {parsed.columns.length} columns · click to replace
            </span>
          </>
        ) : (
          <>
            <span className="text-sm font-medium">Drop a CSV here or click to choose</span>
            <span className="text-xs text-muted-foreground">Parsed in your browser; only the rows you confirm are uploaded.</span>
          </>
        )}
      </button>
      <RowsImport
        key={file ? `${file.name}:${parsed?.rows.length}` : "none"}
        parsed={parsed}
        filename={file?.name ?? ""}
        defaultName={file ? listName(file.name) : "Customers"}
        pickError={error}
        onDone={onDone}
      />
    </div>
  );
}

/* CRM ------------------------------------------------------------------------- */

type CrmStatus = Partial<Record<CrmId, { connected: boolean; accountId?: string | null }>>;
type CrmList = { id: string; name: string; size: number | null };

/** Which CRMs this brand has connected through Composio. `null` while loading. */
function useCrmStatus() {
  const brand = useBrand();
  const [status, setStatus] = useState<CrmStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      const res = await postJson<{ ok: boolean; crms?: CrmStatus; error?: string }>("/api/pages/crm/status", { brand_id: brand._id });
      if (!res.ok) throw new Error(res.error ?? "Could not reach Composio");
      setStatus(res.crms ?? {});
      setError(null);
      return res.crms ?? {};
    } catch (err) {
      setError(String((err as Error).message ?? err));
      setStatus({});
      return {};
    }
  }, [brand._id]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { status, error, refresh };
}

function CrmConnectButton({ crm, connected, onClick }: { crm: (typeof CRMS)[number]; connected?: boolean; onClick?: () => void }) {
  const Logo = crm.logo;
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-center gap-3 rounded-xl border bg-card px-4 py-6 text-center transition-colors outline-none hover:border-primary/50 hover:bg-primary/5 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Logo className="size-10 transition-transform group-hover:scale-110" />
      <span className="space-y-0.5">
        <span className="block text-sm font-medium">{crm.name}</span>
        <span className="block text-xs text-muted-foreground">{crm.body}</span>
      </span>
      {connected ? (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
          <Check className="size-3.5" /> Connected · Import
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
          Connect <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      )}
    </button>
  );
}

/**
 * Connect HubSpot or Salesforce through Composio (a hosted sign-in in a popup),
 * pick a list, pull its contacts, then the same mapping as a CSV.
 */
function CrmTab({ crm, onCrm, onDone }: { crm: CrmId | null; onCrm: (id: CrmId) => void; onDone: () => void }) {
  const brand = useBrand();
  const { status, error: statusError, refresh } = useCrmStatus();
  const [connecting, setConnecting] = useState(false);
  const [lists, setLists] = useState<CrmList[] | null>(null);
  const [listId, setListId] = useState("all");
  const [pulled, setPulled] = useState<{ parsed: ParsedCsv; source: CrmSource } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const chosen = CRMS.find((c) => c.id === crm);
  const connected = !!(crm && status?.[crm]?.connected);

  // While the popup is open: check again when it reports back, and every few seconds meanwhile.
  useEffect(() => {
    if (!connecting || !crm) return;
    let stopped = false;
    const check = async () => {
      const s = await refresh();
      if (!stopped && s[crm]?.connected) setConnecting(false);
    };
    const onMessage = (e: MessageEvent) => {
      if (e.origin === window.location.origin && (e.data as { type?: string })?.type === "slice:crm-connected") void check();
    };
    window.addEventListener("message", onMessage);
    const timer = setInterval(check, 3000);
    const giveUp = setTimeout(() => setConnecting(false), 180_000);
    return () => {
      stopped = true;
      window.removeEventListener("message", onMessage);
      clearInterval(timer);
      clearTimeout(giveUp);
    };
  }, [connecting, crm, refresh]);

  // Once connected, the lists to import from.
  useEffect(() => {
    if (!crm || !connected) return;
    let alive = true;
    setLists(null);
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
    if (!crm) return;
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
    if (!crm || !chosen) return;
    const list = lists?.find((l) => l.id === listId);
    setBusy("Reading contacts");
    setError(null);
    try {
      const res = await postJson<{ ok: boolean; columns?: string[]; rows?: Record<string, string>[]; error?: string }>("/api/pages/crm/contacts", {
        brand_id: brand._id,
        crm,
        list_id: listId,
      });
      if (!res.ok) throw new Error(res.error ?? "Could not read the contacts");
      if (!res.rows?.length) throw new Error(`No contacts in ${list?.name ?? "that list"}.`);
      setPulled({
        parsed: { columns: res.columns ?? [], rows: res.rows, delimiter: "," },
        source: { crm, listId, listName: list?.name ?? "All contacts" },
      });
    } catch (err) {
      setError(String((err as Error).message ?? err));
    } finally {
      setBusy(null);
    }
  }

  if (!chosen)
    return (
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {CRMS.map((c) => (
            <CrmConnectButton key={c.id} crm={c} connected={!!status?.[c.id]?.connected} onClick={() => onCrm(c.id)} />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Connections run through Composio. You sign in to your CRM; Slice never sees a password or token.</p>
      </div>
    );

  const Logo = chosen.logo;
  if (!connected)
    return (
      <div className="flex flex-1 flex-col gap-5">
        <div className="flex flex-col items-center gap-4 rounded-xl border px-6 py-10 text-center">
          <Logo className="size-14" />
          <div className="space-y-1">
            <h3 className="font-semibold">Connect {chosen.name}</h3>
            <p className="max-w-sm text-sm text-muted-foreground">
              Sign in to {chosen.name} in the window that opens. Slice reads {chosen.body.toLowerCase()}, Qloo reads what each customer likes, and you keep them one by one or cluster them.
            </p>
          </div>
          <Button onClick={connect} disabled={connecting || status === null}>
            {(connecting || status === null) && <Spinner data-icon="inline-start" />}
            {connecting ? "Waiting for the sign-in" : `Connect ${chosen.name}`}
          </Button>
          <p className="text-xs text-muted-foreground">Secured by Composio. Slice never sees a password or token.</p>
        </div>
        {(error ?? statusError) && <p className="text-sm text-destructive">{error ?? statusError}</p>}
      </div>
    );

  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="flex items-center gap-3 rounded-xl border p-4">
        <Logo className="size-8 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{chosen.name} is connected</div>
          <div className="text-xs text-muted-foreground">Through Composio, for this brand only.</div>
        </div>
        <Badge variant="secondary">
          <Check /> Connected
        </Badge>
      </div>
      <div className="flex items-end gap-3">
        <Field label={crm === "hubspot" ? "List" : "Campaign"} className="min-w-0 flex-1">
          <Select
            value={listId}
            disabled={!lists}
            onChange={(e) => {
              setListId(e.target.value);
              setPulled(null);
            }}
          >
            {(lists ?? [{ id: "all", name: "Loading lists…", size: null }]).map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
                {l.size != null ? ` (${fmt.int(l.size)})` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Button variant="outline" onClick={pull} disabled={!lists || !!busy}>
          {busy && <Spinner data-icon="inline-start" />}
          {pulled ? "Read again" : "Read contacts"}
        </Button>
      </div>
      {pulled && (
        <p className="text-xs text-muted-foreground">
          {fmt.int(pulled.parsed.rows.length)} contacts · {pulled.parsed.columns.length} properties from {pulled.source.listName}
        </p>
      )}
      <RowsImport
        key={pulled ? `${pulled.source.crm}:${pulled.source.listId}:${pulled.parsed.rows.length}` : "none"}
        parsed={pulled?.parsed ?? null}
        filename={pulled ? `${chosen.name} · ${pulled.source.listName}` : ""}
        defaultName={pulled ? (pulled.source.listId === "all" ? `${chosen.name} contacts` : pulled.source.listName) : `${chosen.name} contacts`}
        source={pulled?.source}
        pickError={error}
        onDone={onDone}
      />
    </div>
  );
}

/* Sheet ---------------------------------------------------------------------- */

export type AudienceSourceKind = "custom" | "location" | "demographic" | "interests" | "csv" | "crm";

/** Sources the audience builder handles: "custom" opens it empty, the others with that condition added. */
const BUILDER_KINDS = new Set<AudienceSourceKind>(["custom", "location", "demographic", "interests"]);

export const AUDIENCE_SOURCES: { kind: AudienceSourceKind; icon: LucideIcon; title: string; body: string; example?: string; soon?: boolean }[] = [
  {
    kind: "custom",
    icon: ListFilter,
    title: "Build an audience",
    body: "Combine a place, ages, gender, the brands, music and films they love, their lifestyle and genres. Qloo reads them together.",
    example: "Under 25s in Austin, into Nike and Tyler, the Creator",
  },
  {
    kind: "location",
    icon: MapPin,
    title: "A city",
    body: "What a city listens to, watches, reads and books. Narrow it by age, gender or taste.",
    example: "Austin, 25 to 29",
  },
  {
    kind: "demographic",
    icon: Users,
    title: "An age group",
    body: "Age bands and gender, from Qloo's demographic signals. Add a place or an interest to sharpen it.",
    example: "Women, 30 to 34",
  },
  {
    kind: "interests",
    icon: Heart,
    title: "Shared interests",
    body: "Artists, films, places or brands these people love. Qloo builds the profile from what they have in common.",
    example: "Khruangbin, Wes Anderson, Aesop",
  },
  {
    kind: "csv",
    icon: FileSpreadsheet,
    title: "Your customers",
    body: "Upload a customer CSV. Qloo reads what each person likes. Keep them one by one for personal pages, or cluster them into audiences.",
    example: "Your top customers",
  },
  {
    kind: "crm",
    icon: Plug,
    title: "Connect a CRM",
    body: "Import contacts from a HubSpot list or a Salesforce campaign through Composio. Qloo reads each person; keep them one by one or cluster them.",
    example: "Your HubSpot webinar list",
  },
];

export function SourceIcon({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground", className)}>
      <Icon className="size-4" />
    </span>
  );
}

// The example chain on the builder card: what "combine" means, at a glance.
const EXAMPLE_CHAIN: { icon: LucideIcon; text: string }[] = [
  { icon: Cake, text: "Under 25" },
  { icon: MapPin, text: "Austin" },
  { icon: ShoppingBag, text: "Nike" },
  { icon: Music, text: "Tyler, the Creator" },
  { icon: Compass, text: "Sneakerheads" },
];

/** The builder as the first, featured source. */
export function BuilderCard({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex w-full flex-col overflow-hidden rounded-xl bg-card text-left ring-1 ring-foreground/10 transition-shadow outline-none hover:shadow-lg focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    >
      <div className="flex flex-1 flex-wrap content-center items-center justify-center gap-x-1.5 gap-y-2 bg-neutral-950 px-5 py-6">
        {EXAMPLE_CHAIN.map(({ icon: Icon, text }, i) => (
          <span key={text} className="flex items-center gap-1.5">
            {i > 0 && <span className="px-0.5 text-xs text-white/45">and</span>}
            <span className="flex items-center gap-1.5 rounded-full bg-white/10 py-1 pr-3 pl-2 text-sm font-medium text-white ring-1 ring-white/15 transition-colors group-hover:bg-white/15">
              <Icon className="size-3.5 text-white/70" />
              {text}
            </span>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-4 p-4">
        <SourceIcon icon={ListFilter} className="bg-primary text-primary-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Build an audience</span>
          <span className="mt-0.5 block text-sm text-muted-foreground">
            Combine a place, ages, gender, the brands, music and films they love, their lifestyle and genres. Qloo reads them together.
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
    </button>
  );
}

function SourceRow({ src, onClick }: { src: (typeof AUDIENCE_SOURCES)[number]; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-colors outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <SourceIcon icon={src.icon} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{src.title}</span>
        <span className="mt-0.5 block text-sm text-muted-foreground">{src.body}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

function SourcePicker({ onPick, onCrm }: { onPick: (k: AudienceSourceKind) => void; onCrm: (id: CrmId) => void }) {
  const { status } = useCrmStatus();
  const starters = AUDIENCE_SOURCES.filter((src) => src.kind === "location" || src.kind === "demographic" || src.kind === "interests");
  const customers = AUDIENCE_SOURCES.find((src) => src.kind === "csv")!;
  return (
    <div className="space-y-8">
      <BuilderCard onClick={() => onPick("custom")} />
      <section className="space-y-3">
        <h3 className="text-sm font-medium">Or start from one condition</h3>
        <ul className="space-y-2">
          {starters.map((src) => (
            <li key={src.kind}>
              <SourceRow src={src} onClick={() => onPick(src.kind)} />
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-3">
        <h3 className="text-sm font-medium">From your own data</h3>
        <SourceRow src={customers} onClick={() => onPick("csv")} />
      </section>
      <section className="space-y-3">
        <h3 className="text-sm font-medium">Or connect a CRM</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {CRMS.map((c) => (
            <CrmConnectButton key={c.id} crm={c} connected={!!status?.[c.id]?.connected} onClick={() => onCrm(c.id)} />
          ))}
        </div>
      </section>
    </div>
  );
}

/**
 * Two steps in one sheet: pick where the audience comes from, then define it.
 * `kind` preselects a source (the empty state's cards open straight into one).
 * The builder sources share one wide form; the sheet widens for it.
 */
export function NewAudienceSheet({
  open,
  kind,
  onOpenChange,
  onKindChange,
  onCreated,
}: {
  open: boolean;
  kind: AudienceSourceKind | null;
  onOpenChange: (o: boolean) => void;
  onKindChange: (k: AudienceSourceKind | null) => void;
  /** The builder saved a new audience (Media picks it straight away). */
  onCreated?: (id: Id<"pagesAudiences">, name: string) => void;
}) {
  const close = () => onOpenChange(false);
  const source = AUDIENCE_SOURCES.find((s) => s.kind === kind) ?? null;
  const builder = !!source && BUILDER_KINDS.has(source.kind);
  const [crm, setCrm] = useState<CrmId | null>(null);
  const pickCrm = (id: CrmId) => {
    setCrm(id);
    onKindChange("crm");
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        showCloseButton={!source}
        className={cn(
          "w-full gap-0 overflow-x-hidden overflow-y-auto",
          builder ? "bg-neutral-50 data-[side=right]:sm:max-w-5xl" : "data-[side=right]:sm:max-w-xl",
        )}
      >
        {source ? (
          <SheetBar
            onBack={() => {
              setCrm(null);
              onKindChange(null);
            }}
            title={builder ? "Build an audience" : source.title}
            description={builder ? "Combine conditions. Qloo reads them together and the preview shows who that makes." : source.body}
          />
        ) : (
          <SheetHeader className="gap-3 border-b bg-popover p-6">
            <SheetTitle>New audience</SheetTitle>
            <SheetDescription>Who is the page for? Pick where the audience comes from; Qloo turns it into a taste profile the builder writes against.</SheetDescription>
          </SheetHeader>
        )}
        <div className="flex flex-1 flex-col px-6 pt-6 pb-6 has-[.sticky]:pb-0">
          {!source && <SourcePicker onPick={onKindChange} onCrm={pickCrm} />}
          {builder && (
            <AudienceBuilder
              key={source.kind}
              initialRows={PRESET_ROWS[source.kind]}
              onDone={(id, name) => {
                close();
                onCreated?.(id, name);
              }}
              onCancel={close}
            />
          )}
          {source?.kind === "csv" && <CsvTab onDone={close} />}
          {source?.kind === "crm" && <CrmTab crm={crm} onCrm={setCrm} onDone={close} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * The sheet's top bar once a source is picked: a back button to the sources,
 * the title, and close. Sticky, so both stay in reach on a long form.
 */
function SheetBar({ onBack, title, description }: { onBack?: () => void; title: ReactNode; description?: ReactNode }) {
  return (
    <SheetHeader className="sticky top-0 z-20 flex-row items-center gap-3 border-b bg-popover px-4 py-3">
      {onBack && (
        <>
          <Button variant="outline" onClick={onBack} className="shrink-0">
            <ArrowLeft data-icon="inline-start" /> All sources
          </Button>
          <span aria-hidden className="h-8 w-px shrink-0 bg-border" />
        </>
      )}
      <div className={cn("min-w-0 flex-1", !onBack && "pl-2")}>
        <SheetTitle className="truncate">{title}</SheetTitle>
        {description && <SheetDescription className="line-clamp-1">{description}</SheetDescription>}
      </div>
      <SheetClose render={<Button variant="ghost" size="icon-sm" className="shrink-0" />}>
        <X />
        <span className="sr-only">Close</span>
      </SheetClose>
    </SheetHeader>
  );
}

/** The builder in its own sheet, for changing an audience's conditions. */
export function EditAudienceSheet({ audience, onClose, onSaved }: { audience: Audience | null; onClose: () => void; onSaved: (id: Id<"pagesAudiences">) => void }) {
  return (
    <Sheet open={!!audience} onOpenChange={(o) => !o && onClose()}>
      <SheetContent showCloseButton={false} className="w-full gap-0 overflow-x-hidden overflow-y-auto bg-neutral-50 data-[side=right]:sm:max-w-5xl">
        <SheetBar
          title="Edit conditions"
          description={audience ? `${audience.name}. Saving recompiles its taste profile and rewrites the brief.` : undefined}
        />
        <div className="flex flex-1 flex-col px-6 pt-6 pb-0">
          {audience && <AudienceBuilder key={audience._id} audience={audience} onDone={onSaved} onCancel={onClose} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}

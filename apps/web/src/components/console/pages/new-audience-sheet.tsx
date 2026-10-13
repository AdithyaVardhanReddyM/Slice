"use client";

import { useAction, useMutation } from "convex/react";
import { ArrowLeft, Cake, Check, ChevronRight, Compass, FileSpreadsheet, Heart, ListFilter, MapPin, Music, Plug, ShoppingBag, Upload as UploadIcon, Users, X, type LucideIcon } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/format";
import { parseCsv, suggestMapping, type CsvMapping, type ParsedCsv } from "@/lib/pages/csv";
import { postJson } from "@/lib/pages/stream";
import type { Audience } from "@/lib/pages/types";
import { Field, Select } from "@/components/console/form";
import { FieldGroup, Spinner } from "@/components/console/setup/atoms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBrand } from "./brand-context";
import { AudienceBuilder, PRESET_ROWS } from "./audience-builder";
import { CRMS, type CrmId } from "./crm-logos";

const CHUNK = 200;

function Footer({ busy, disabled, label, error, onSubmit }: { busy: boolean; disabled: boolean; label: string; error: string | null; onSubmit: () => void }) {
  return (
    <div className="sticky bottom-0 -mx-6 mt-auto flex items-center justify-between gap-4 border-t bg-popover px-6 py-4">
      <p className="text-xs text-muted-foreground">
        {error ? <span className="text-destructive">{error}</span> : "Takes about 20 seconds. The audience card fills in as Qloo answers."}
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

function CsvTab({ onDone }: { onDone: () => void }) {
  const brand = useBrand();
  const createUpload = useMutation(api.pagesUploads.create);
  const appendRows = useMutation(api.pagesUploads.appendRows);
  const process = useAction(api.pagesUploads.process);
  const fileRef = useRef<HTMLInputElement>(null);
  const [filename, setFilename] = useState("");
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<CsvMapping>({ taste: [] });
  const [k, setK] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File) {
    setError(null);
    const text = await file.text();
    const p = parseCsv(text);
    if (p.columns.length === 0 || p.rows.length === 0) {
      setError("That file has no rows. Export it as CSV with a header row.");
      return;
    }
    setFilename(file.name);
    setParsed(p);
    setMapping(suggestMapping(p.columns));
  }

  const sample = useMemo(() => parsed?.rows.slice(0, 5) ?? [], [parsed]);
  const toggleTaste = (c: string) => setMapping((m) => ({ ...m, taste: m.taste.includes(c) ? m.taste.filter((x) => x !== c) : [...m.taste, c] }));
  const setRole = (key: (typeof ROLES)[number]["key"], col: string) =>
    setMapping((m) => ({ ...m, [key]: col || undefined, taste: m.taste.filter((t) => t !== col) }));

  async function submit() {
    if (!parsed) return;
    setBusy("Uploading rows");
    setError(null);
    try {
      const rows = parsed.rows;
      const { id } = await createUpload({ brandId: brand._id, filename, columns: parsed.columns, rows: rows.slice(0, CHUNK), mapping });
      for (let i = CHUNK; i < rows.length; i += CHUNK) {
        setBusy(`Uploading rows ${fmt.int(i)} of ${fmt.int(rows.length)}`);
        await appendRows({ uploadId: id, rows: rows.slice(i, i + CHUNK) });
      }
      onDone();
      // The long part runs server-side; the audiences screen follows the upload's progress.
      process({ uploadId: id, ...(k ? { k: Number(k) } : {}) })
        .then(() => postJson("/api/pages/name-clusters", { upload_id: id }).catch(() => undefined))
        .catch(() => undefined);
    } catch (err) {
      setError(String((err as Error).message ?? err));
      setBusy(null);
    }
  }

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
        {parsed ? (
          <>
            <span className="text-sm font-medium">{filename}</span>
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

      {parsed && (
        <>
          <FieldGroup label="Taste columns" hint="Multi-value cells split on ; , or |. Pick every column that holds things people like." aside={`${mapping.taste.length} selected`}>
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
                  <option value="">Not in file</option>
                  {parsed.columns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>
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
        label={busy ?? "Upload and cluster"}
        error={error}
        onSubmit={submit}
      />
    </div>
  );
}

/* CRM ------------------------------------------------------------------------- */

function CrmConnectButton({ crm, onClick }: { crm: (typeof CRMS)[number]; onClick?: () => void }) {
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
      <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
        Connect <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
      </span>
    </button>
  );
}

function CrmTab({ crm, onCrm }: { crm: CrmId | null; onCrm: (id: CrmId) => void }) {
  const chosen = CRMS.find((c) => c.id === crm);
  if (!chosen)
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {CRMS.map((c) => (
          <CrmConnectButton key={c.id} crm={c} onClick={() => onCrm(c.id)} />
        ))}
      </div>
    );
  const Logo = chosen.logo;
  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="flex flex-col items-center gap-4 rounded-xl border px-6 py-10 text-center">
        <Logo className="size-14" />
        <div className="space-y-1">
          <h3 className="font-semibold">Connect {chosen.name}</h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            Slice syncs {chosen.body.toLowerCase()}, resolves what each customer likes with Qloo and clusters them into audiences that stay up to date.
          </p>
        </div>
        <Button disabled>Connect {chosen.name}</Button>
        <Badge variant="outline">Coming soon</Badge>
      </div>
      <p className="text-sm text-muted-foreground">Until then, export a customer list from {chosen.name} and upload it under Your customers.</p>
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
    body: "Upload a customer CSV. Qloo resolves what each person likes, then the rows are clustered into audiences.",
    example: "Your top customers, clustered",
  },
  { kind: "crm", icon: Plug, title: "Connect a CRM", body: "Sync customers from HubSpot or Salesforce and keep the audiences up to date.", soon: true },
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
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">Or connect a CRM</h3>
          <Badge variant="outline">Soon</Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {CRMS.map((c) => (
            <CrmConnectButton key={c.id} crm={c} onClick={() => onCrm(c.id)} />
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
}: {
  open: boolean;
  kind: AudienceSourceKind | null;
  onOpenChange: (o: boolean) => void;
  onKindChange: (k: AudienceSourceKind | null) => void;
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
          {builder && <AudienceBuilder key={source.kind} initialRows={PRESET_ROWS[source.kind]} onDone={close} onCancel={close} />}
          {source?.kind === "csv" && <CsvTab onDone={close} />}
          {source?.kind === "crm" && <CrmTab crm={crm} onCrm={setCrm} />}
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

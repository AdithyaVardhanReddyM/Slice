"use client";

import { useAction, useMutation } from "convex/react";
import { ArrowLeft, Check, ChevronRight, FileSpreadsheet, Heart, MapPin, Plug, Upload as UploadIcon, Users, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/format";
import { parseCsv, suggestMapping, type CsvMapping, type ParsedCsv } from "@/lib/pages/csv";
import { postJson } from "@/lib/pages/stream";
import { AGE_LABEL } from "@/lib/pages/types";
import { Field, Input, Select } from "@/components/console/form";
import { FieldGroup, Spinner } from "@/components/console/setup/atoms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBrand } from "./brand-context";
import { CityAutocomplete, CityMap, searchCities, type City } from "./city-picker";
import { EditorField } from "./editor-layout";
import { InterestPicker, type PickedEntity } from "./interest-picker";
import { CRMS, type CrmId } from "./crm-logos";

const CHUNK = 200;

/**
 * Compile, then ask the agent for a brief. A failed compile is recorded on the
 * audience itself (status "failed" with the reason, shown on its card), so it
 * is not rethrown here; brief errors are swallowed too.
 */
export function useCompileAudience() {
  const compile = useAction(api.pagesAudiences.compile);
  return useCallback(
    async (id: Id<"pagesAudiences">) => {
      try {
        await compile({ id });
      } catch {
        return;
      }
      postJson("/api/pages/audience-brief", { audience_id: id }).catch(() => undefined);
    },
    [compile],
  );
}

function DemographicFields({
  age,
  gender,
  onAge,
  onGender,
}: {
  age: string;
  gender: string;
  onAge: (v: string) => void;
  onGender: (v: string) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Age" optional>
        <Select value={age} onChange={(e) => onAge(e.target.value)}>
          <option value="">Any age</option>
          {Object.entries(AGE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Gender" optional>
        <Select value={gender} onChange={(e) => onGender(e.target.value)}>
          <option value="">Any</option>
          <option value="female">Women</option>
          <option value="male">Men</option>
        </Select>
      </Field>
    </div>
  );
}

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

/* Location --------------------------------------------------------------------- */

function LocationTab({ onDone }: { onDone: () => void }) {
  const brand = useBrand();
  const create = useMutation(api.pagesAudiences.create);
  const run = useCompileAudience();
  const [city, setCity] = useState(cityOf(brand.brief?.locations?.[0]));
  const [country, setCountry] = useState("");
  const [picked, setPicked] = useState<City | null>(null);

  // The city prefilled from the brand's own locations gets its pin and country too.
  const prefilled = useRef(city);
  useEffect(() => {
    if (!prefilled.current) return;
    const ctrl = new AbortController();
    searchCities(prefilled.current, ctrl.signal)
      .then(([first]) => {
        if (!first) return;
        setPicked(first);
        setCountry((c) => c || first.country);
      })
      .catch(() => undefined);
    return () => ctrl.abort();
  }, []);
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoName = [city.trim(), age ? AGE_LABEL[age].toLowerCase() : "", gender === "female" ? "women" : gender === "male" ? "men" : ""].filter(Boolean).join(", ");

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const { id } = await create({
        brandId: brand._id,
        name: name.trim() || autoName,
        kind: "location",
        sources: {
          location: { city: city.trim(), country: country.trim() || undefined },
          ...(age || gender ? { demographics: { age: age || undefined, gender: gender || undefined } } : {}),
        },
      });
      onDone();
      void run(id);
    } catch (err) {
      setError(String((err as Error).message ?? err));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="space-y-3">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <EditorField label="City">
            <CityAutocomplete
              value={city}
              autoFocus
              onChange={(text) => {
                setCity(text);
                setPicked(null);
              }}
              onSelect={(c) => {
                setCity(c.name);
                setCountry(c.country);
                setPicked(c);
              }}
            />
          </EditorField>
          <Field label="Country" optional>
            <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Filled in from the city" />
          </Field>
        </div>
        <CityMap city={picked} />
      </div>
      <DemographicFields age={age} gender={gender} onAge={setAge} onGender={setGender} />
      <Field label="Name" optional hint={`Shown on the audience card. Defaults to “${autoName || "the city"}”.`}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={autoName} />
      </Field>
      <Footer busy={busy} disabled={!city.trim()} label="Create audience" error={error} onSubmit={submit} />
    </div>
  );
}

/* Demographics --------------------------------------------------------------------- */

function DemographicTab({ onDone }: { onDone: () => void }) {
  const brand = useBrand();
  const create = useMutation(api.pagesAudiences.create);
  const run = useCompileAudience();
  const [age, setAge] = useState("25_to_29");
  const [gender, setGender] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoName = [age ? AGE_LABEL[age] : "All ages", gender === "female" ? "women" : gender === "male" ? "men" : ""].filter(Boolean).join(", ");

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const { id } = await create({
        brandId: brand._id,
        name: name.trim() || autoName,
        kind: "demographic",
        sources: { demographics: { age: age || undefined, gender: gender || undefined } },
      });
      onDone();
      void run(id);
    } catch (err) {
      setError(String((err as Error).message ?? err));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-5">
      <DemographicFields age={age} gender={gender} onAge={setAge} onGender={setGender} />
      <Field label="Name" optional hint={`Defaults to “${autoName}”.`}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={autoName} />
      </Field>
      <Footer busy={busy} disabled={!age && !gender} label="Create audience" error={error} onSubmit={submit} />
    </div>
  );
}

/* Interests ---------------------------------------------------------------------- */

function InterestsTab({ onDone }: { onDone: () => void }) {
  const brand = useBrand();
  const create = useMutation(api.pagesAudiences.create);
  const run = useCompileAudience();
  const [picked, setPicked] = useState<PickedEntity[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const names = picked.map((p) => p.name);
  const autoName = names.slice(0, 3).join(", ") + (names.length > 3 ? ` +${names.length - 3}` : "");

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const { id } = await create({
        brandId: brand._id,
        name: name.trim() || autoName,
        kind: "interests",
        sources: { interests: names, interestEntities: picked },
      });
      onDone();
      void run(id);
    } catch (err) {
      setError(String((err as Error).message ?? err));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-5">
      <FieldGroup
        label="Interests"
        aside={`${picked.length} added`}
        hint="Pick from Qloo's suggestions. A single well-known brand is enough: Qloo reads its customers' taste."
      >
        <InterestPicker value={picked} onChange={setPicked} />
      </FieldGroup>
      <Field label="Name" optional>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={autoName || "People who love…"} />
      </Field>
      <Footer busy={busy} disabled={picked.length < 1} label="Create audience" error={error} onSubmit={submit} />
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

/** "2211 NE Alberta St, Portland, OR 97211" → "Portland"; "Lisbon, Portugal" → "Lisbon". */
function cityOf(location: string | undefined): string {
  if (!location) return "";
  const parts = location.split(",").map((p) => p.trim()).filter(Boolean);
  const pick = parts.length >= 3 ? parts[parts.length - 2] : parts[0] ?? "";
  return /\d/.test(pick) ? "" : pick;
}

export type AudienceSourceKind = "location" | "demographic" | "interests" | "csv" | "crm";

export const AUDIENCE_SOURCES: { kind: AudienceSourceKind; icon: LucideIcon; title: string; body: string; example?: string; soon?: boolean }[] = [
  {
    kind: "location",
    icon: MapPin,
    title: "A city",
    body: "What a city listens to, watches, reads and books. Narrow it by age or gender.",
    example: "Austin, 25 to 29",
  },
  {
    kind: "demographic",
    icon: Users,
    title: "A demographic",
    body: "An age band and gender across every market, from Qloo's demographic signals.",
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

function SourcePicker({ onPick, onCrm }: { onPick: (k: AudienceSourceKind) => void; onCrm: (id: CrmId) => void }) {
  return (
    <div className="space-y-8">
      <ul className="space-y-2">
        {AUDIENCE_SOURCES.filter((src) => src.kind !== "crm").map((src) => (
          <li key={src.kind}>
            <button
              type="button"
              onClick={() => onPick(src.kind)}
              className="group flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-colors outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <SourceIcon icon={src.icon} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{src.title}</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{src.body}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </button>
          </li>
        ))}
      </ul>
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
  const [crm, setCrm] = useState<CrmId | null>(null);
  const pickCrm = (id: CrmId) => {
    setCrm(id);
    onKindChange("crm");
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-x-hidden overflow-y-auto data-[side=right]:sm:max-w-xl">
        <SheetHeader className="gap-3 border-b p-6">
          {source ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="-ml-2 w-fit text-muted-foreground"
                onClick={() => {
                  setCrm(null);
                  onKindChange(null);
                }}
              >
                <ArrowLeft data-icon="inline-start" /> All sources
              </Button>
              <div className="flex items-start gap-3">
                <SourceIcon icon={source.icon} />
                <div className="min-w-0 space-y-0.5">
                  <SheetTitle>{source.title}</SheetTitle>
                  <SheetDescription>{source.body}</SheetDescription>
                </div>
              </div>
            </>
          ) : (
            <>
              <SheetTitle>New audience</SheetTitle>
              <SheetDescription>Who is the page for? Pick where the audience comes from; Qloo turns it into a taste profile the builder writes against.</SheetDescription>
            </>
          )}
        </SheetHeader>
        <div className="flex flex-1 flex-col px-6 pt-6 pb-6 has-[.sticky]:pb-0">
          {!source && <SourcePicker onPick={onKindChange} onCrm={pickCrm} />}
          {source?.kind === "location" && <LocationTab onDone={close} />}
          {source?.kind === "demographic" && <DemographicTab onDone={close} />}
          {source?.kind === "interests" && <InterestsTab onDone={close} />}
          {source?.kind === "csv" && <CsvTab onDone={close} />}
          {source?.kind === "crm" && <CrmTab crm={crm} onCrm={setCrm} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}

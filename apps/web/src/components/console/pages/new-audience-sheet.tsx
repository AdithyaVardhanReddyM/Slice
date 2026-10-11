"use client";

import { useAction, useMutation } from "convex/react";
import { Check, Upload as UploadIcon } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/format";
import { parseCsv, suggestMapping, type CsvMapping, type ParsedCsv } from "@/lib/pages/csv";
import { postJson } from "@/lib/pages/stream";
import { AGE_LABEL } from "@/lib/pages/types";
import { Field, Input, Select, Tab, TabList, TabPanel, Tabs } from "@/components/console/form";
import { FieldGroup, Spinner, TokenInput } from "@/components/console/setup/atoms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBrand } from "./brand-context";
import { Hint } from "./shared";

const CHUNK = 200;

/** Compile, then ask the agent for a brief. Errors from the brief are swallowed: the profile is what matters. */
export function useCompileAudience() {
  const compile = useAction(api.pagesAudiences.compile);
  return useCallback(
    async (id: Id<"pagesAudiences">) => {
      await compile({ id });
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
    <div className="flex items-center justify-between gap-3 border-t pt-4">
      <p className="text-xs text-muted-foreground">{error ? <span className="text-destructive">{error}</span> : "Compiling takes about 20 seconds; the card fills in as Qloo answers."}</p>
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
    <div className="space-y-5">
      <Hint>Qloo reads what a city listens to, watches, reads and books, then writes a taste profile for it. Add an age or gender to narrow it.</Hint>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="City">
          <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Austin" autoFocus />
        </Field>
        <Field label="Country" optional>
          <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="United States" />
        </Field>
      </div>
      <DemographicFields age={age} gender={gender} onAge={setAge} onGender={setGender} />
      <Field label="Name" optional hint={`Defaults to “${autoName || "the city"}”.`}>
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
    <div className="space-y-5">
      <Hint>A taste profile for an age band and gender across every market, from Qloo&apos;s demographic signals.</Hint>
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
  const [interests, setInterests] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoName = interests.slice(0, 3).join(", ") + (interests.length > 3 ? ` +${interests.length - 3}` : "");

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const { id } = await create({ brandId: brand._id, name: name.trim() || autoName, kind: "interests", sources: { interests } });
      onDone();
      void run(id);
    } catch (err) {
      setError(String((err as Error).message ?? err));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Hint>Type artists, films, books, places or brands this audience loves. Qloo resolves each name and builds the profile from what they have in common.</Hint>
      <FieldGroup label="Interests" aside={`${interests.length} added`}>
        <TokenInput values={interests} onChange={setInterests} placeholder="Khruangbin, Wes Anderson, Aesop…" />
      </FieldGroup>
      <Field label="Name" optional>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={autoName || "People who love…"} />
      </Field>
      <Footer busy={busy} disabled={interests.length < 2} label="Create audience" error={error} onSubmit={submit} />
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
    <div className="space-y-5">
      <Hint>
        A spreadsheet of customers with columns for what they like (artists, films, brands, restaurants) and optionally where they live and how old they are. Qloo
        resolves every name, then the rows are clustered into audiences.
      </Hint>
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

const CRMS = [
  { name: "HubSpot", body: "Contacts with lists and properties." },
  { name: "Salesforce", body: "Leads and contacts from a report." },
  { name: "Klaviyo", body: "Profiles and segments." },
  { name: "Shopify", body: "Customers with order history." },
];

function CrmTab() {
  return (
    <div className="space-y-5">
      <Hint>Connect a CRM to sync customers without a CSV. Until then, export a list and use the Upload CSV tab.</Hint>
      <div className="grid gap-3 sm:grid-cols-2">
        {CRMS.map((c) => (
          <div key={c.name} className="flex items-start justify-between gap-3 rounded-lg border p-4 opacity-70" aria-disabled>
            <div>
              <div className="text-sm font-medium">{c.name}</div>
              <p className="text-xs text-muted-foreground">{c.body}</p>
            </div>
            <Badge variant="outline">Soon</Badge>
          </div>
        ))}
      </div>
      <Button disabled variant="outline">
        Connect
      </Button>
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

export function NewAudienceSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const close = () => onOpenChange(false);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-x-hidden overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>New audience</SheetTitle>
          <SheetDescription>Define who the page is for. Qloo turns the definition into a taste profile the builder writes against.</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">
          <Tabs defaultValue="location">
            <TabList className="mb-5 h-auto flex-wrap">
              <Tab value="location">Location</Tab>
              <Tab value="demographic">Demographics</Tab>
              <Tab value="interests">Interests</Tab>
              <Tab value="csv">Upload CSV</Tab>
              <Tab value="crm">Connect CRM</Tab>
            </TabList>
            <TabPanel value="location">
              <LocationTab onDone={close} />
            </TabPanel>
            <TabPanel value="demographic">
              <DemographicTab onDone={close} />
            </TabPanel>
            <TabPanel value="interests">
              <InterestsTab onDone={close} />
            </TabPanel>
            <TabPanel value="csv">
              <CsvTab onDone={close} />
            </TabPanel>
            <TabPanel value="crm">
              <CrmTab />
            </TabPanel>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}

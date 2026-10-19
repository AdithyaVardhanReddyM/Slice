"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { Boxes, Check, FileSpreadsheet, ShoppingBag, Upload as UploadIcon, UsersRound } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import { MAX_CONTACT_ROWS, MAX_PEOPLE_LIST } from "@slice/backend/convex/emailTypes";
import { splitTerms } from "@slice/backend/convex/pagesCsv";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/format";
import { parseCsv, suggestMapping, type ParsedCsv } from "@/lib/pages/csv";
import { postJson } from "@/lib/pages/stream";
import { Field, Select } from "@/components/console/form";
import { ChoiceCard, ChoiceCardGroup, FieldGroup, Notice, Spinner } from "@/components/console/setup/atoms";
import { errorText } from "@/lib/email/labels";
import { useEmailBrand } from "@/components/console/email/brand-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CRMS, type CrmId } from "@/components/console/pages/crm-logos";
import { CrmImport } from "./crm-import";
import { Avatar } from "./shared";

// Convex caps a mutation's arguments; 500 rows of a contact CSV stay well under it.
const CHUNK = 500;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface EmailMapping {
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  /** What they bought or booked. */
  purchases: string[];
  /** What they like, when the business knows it. */
  taste: string[];
  neighborhood?: string;
  city?: string;
  country?: string;
  age?: string;
  gender?: string;
}

type Role = Exclude<keyof EmailMapping, "taste" | "purchases" | "email">;

const ROLES: { key: Role; label: string }[] = [
  { key: "name", label: "Full name" },
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "neighborhood", label: "Neighbourhood" },
  { key: "city", label: "City" },
  { key: "country", label: "Country" },
  { key: "age", label: "Age" },
  { key: "gender", label: "Gender" },
];

/** Columns that read as purchase history: orders, bookings, visits. */
const PURCHASE_COLUMN = /purchase|order|bought|book(ed|ing)|reserv|visit|transaction|history|recent/i;

/** The Pages guess (taste, place, age, gender) plus the columns email needs: the address, the name parts and purchases. */
export function suggestEmailMapping(columns: string[]): EmailMapping {
  const base = suggestMapping(columns);
  const pick = (re: RegExp) => columns.find((c) => re.test(c.trim()));
  const email = pick(/^e-?mail(_?address)?$/i) ?? pick(/e-?mail/i) ?? "";
  const firstName = pick(/^(first|given)[\s_-]?name$|^first$/i);
  const lastName = pick(/^(last|family)[\s_-]?name$|^surname$|^last$/i);
  // With first and last columns, a "name" guess is usually one of them.
  const name = pick(/^(full[\s_-]?)?name$/i) ?? (firstName ? undefined : base.name !== email ? base.name : undefined);
  const neighborhood = pick(/neighbou?rhood|district|area|suburb/i);
  const city = base.city !== neighborhood ? base.city : undefined;
  const taken = new Set([email, name, firstName, lastName, neighborhood, city, base.country, base.age, base.gender].filter(Boolean));
  const purchases = columns.filter((c) => !taken.has(c) && PURCHASE_COLUMN.test(c));
  return {
    email,
    name,
    firstName,
    lastName,
    purchases,
    taste: base.taste.filter((c) => !taken.has(c) && !purchases.includes(c)),
    neighborhood,
    city,
    country: base.country,
    age: base.age,
    gender: base.gender,
  };
}

/** How a row will read as a contact, for the preview. */
function readRow(row: Record<string, string>, m: EmailMapping) {
  const email = (row[m.email] ?? "").trim().toLowerCase();
  const joined = [m.firstName && row[m.firstName], m.lastName && row[m.lastName]].filter(Boolean).join(" ");
  const name = (m.name && row[m.name]) || joined || email.split("@")[0] || "";
  return {
    email,
    name,
    where: [m.neighborhood && row[m.neighborhood], m.city && row[m.city], m.country && row[m.country]].filter(Boolean).join(", "),
    age: m.age ? row[m.age] : "",
    bought: m.purchases.flatMap((c) => splitPurchases(row[c])),
    tastes: m.taste.flatMap((c) => splitTerms(row[c])),
  };
}

/** Purchases split like the backend's: ; | and new lines, never commas ("Salt, Fat, Acid, Heat" is one book). */
const splitPurchases = (value: string | undefined) =>
  (value ?? "")
    .split(/[;|\n]/)
    .map((x) => x.trim())
    .filter((x) => x.length > 1);

/** "newsletter-subscribers.csv" → "Newsletter subscribers". */
const listName = (filename: string) => {
  const base = filename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : "Contacts";
};

type Mode = "groups" | "people";

/** Columns as toggle chips: which hold purchases, which hold likes. */
function ColumnPicker({
  label,
  hint,
  optional,
  columns,
  selected,
  onToggle,
}: {
  label: string;
  hint: string;
  optional?: boolean;
  columns: string[];
  selected: string[];
  onToggle: (column: string) => void;
}) {
  return (
    <FieldGroup label={label} hint={hint} aside={selected.length ? `${selected.length} selected` : optional ? "Optional" : "None selected"}>
      <div className="flex flex-wrap gap-1.5">
        {columns.map((c) => {
          const on = selected.includes(c);
          return (
            <button
              key={c}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(c)}
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs transition-colors",
                on ? "border-neutral-900 bg-neutral-900 text-white" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {on && <Check className="size-3" />}
              {c}
            </button>
          );
        })}
      </div>
    </FieldGroup>
  );
}

/** Mapping, preview, the taste-groups-or-individuals choice and the upload. Remount it (key) when the file changes. */
function Mapper({ parsed, filename, onDone }: { parsed: ParsedCsv; filename: string; onDone: (listId: Id<"emailLists">) => void }) {
  const brand = useEmailBrand();
  const audiences = useQuery(api.emailAudiences.list, { brandId: brand._id });
  const hasGroups = (audiences ?? []).some((a) => a.kind === "group");
  const create = useMutation(api.emailLists.create);
  const appendRows = useMutation(api.emailLists.appendRows);
  const process = useAction(api.emailLists.process);
  const rename = useMutation(api.emailAudiences.rename);
  const [mapping, setMapping] = useState<EmailMapping>(() => suggestEmailMapping(parsed.columns));
  const [k, setK] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Rows with a real address, first one wins per address, capped at the upload limit.
  const { rows, skipped, duplicates } = useMemo(() => {
    const seen = new Set<string>();
    const out: Record<string, string>[] = [];
    let skipped = 0;
    let duplicates = 0;
    for (const row of parsed.rows) {
      const email = (row[mapping.email] ?? "").trim().toLowerCase();
      if (!EMAIL_RE.test(email)) skipped++;
      else if (seen.has(email)) duplicates++;
      else {
        seen.add(email);
        out.push(row);
      }
    }
    return { rows: out.slice(0, MAX_CONTACT_ROWS), skipped, duplicates };
  }, [parsed, mapping.email]);
  const over = Math.max(0, rows.length >= MAX_CONTACT_ROWS ? parsed.rows.length - skipped - duplicates - MAX_CONTACT_ROWS : 0);

  // A short list reads best as individual contacts; anything past the limit has to be grouped.
  const [mode, setMode] = useState<Mode>(() => (parsed.rows.length <= MAX_PEOPLE_LIST ? "people" : "groups"));
  const peopleAllowed = rows.length <= MAX_PEOPLE_LIST;
  const effectiveMode: Mode = peopleAllowed ? mode : "groups";

  const preview = useMemo(() => rows.slice(0, 5).map((r) => readRow(r, mapping)), [rows, mapping]);
  // A column is either purchases or likes, never both.
  const toggleColumn = (kind: "purchases" | "taste", c: string) =>
    setMapping((m) => {
      const other = kind === "purchases" ? "taste" : "purchases";
      return { ...m, [kind]: m[kind].includes(c) ? m[kind].filter((x) => x !== c) : [...m[kind], c], [other]: m[other].filter((x) => x !== c) };
    });
  const setRole = (key: Role | "email", col: string) =>
    setMapping((m) => ({ ...m, [key]: key === "email" ? col : col || undefined, taste: m.taste.filter((t) => t !== col), purchases: m.purchases.filter((t) => t !== col) }));

  async function submit() {
    setBusy("Uploading contacts");
    setError(null);
    try {
      const { id: listId } = await create({
        brandId: brand._id,
        name: listName(filename),
        filename,
        columns: parsed.columns,
        mapping,
        mode: effectiveMode,
        rows: rows.slice(0, CHUNK),
      });
      for (let i = CHUNK; i < rows.length; i += CHUNK) {
        setBusy(`Uploading contacts ${fmt.int(i)} of ${fmt.int(rows.length)}`);
        await appendRows({ listId, rows: rows.slice(i, i + CHUNK) });
      }
      onDone(listId);
      // The long part runs server-side and the upload follows its own progress. New groups
      // come back named after their top entities; the agent then gives them human names.
      process({ id: listId, ...(effectiveMode === "groups" && k && !hasGroups ? { k: Number(k) } : {}) })
        .then(async () => {
          if (effectiveMode !== "groups") return;
          const res = await postJson<{ names?: { audienceId: string; name: string }[] }>("/api/email/name-groups", { listId });
          await Promise.all((res.names ?? []).map((n) => rename({ id: n.audienceId as Id<"emailAudiences">, name: n.name }).catch(() => undefined)));
        })
        .catch(() => undefined);
    } catch (err) {
      setError(errorText(err));
      setBusy(null);
    }
  }

  const options = (none: string) => [
    <option key="" value="">
      {none}
    </option>,
    ...parsed.columns.map((c) => (
      <option key={c} value={c}>
        {c}
      </option>
    )),
  ];

  return (
    <>
      <section className="space-y-4">
        <h3 className="text-sm font-semibold">Match your columns</h3>
        <Field label="Email address" hint={!mapping.email ? "Pick the column with the addresses; rows without one are skipped." : undefined}>
          <Select value={mapping.email} onChange={(e) => setRole("email", e.target.value)} aria-invalid={!mapping.email || undefined}>
            {options("Choose a column")}
          </Select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          {ROLES.map((r) => (
            <Field key={r.key} label={r.label} optional>
              <Select value={mapping[r.key] ?? ""} onChange={(e) => setRole(r.key, e.target.value)}>
                {options("Not in file")}
              </Select>
            </Field>
          ))}
        </div>
        <ColumnPicker
          label="What they bought or booked"
          hint="Recent orders, bookings or visits: titles, products, restaurants. Matched to your catalog first, then read by Qloo. Split several in a cell with ; or |."
          columns={parsed.columns.filter((c) => c !== mapping.email)}
          selected={mapping.purchases}
          onToggle={(c) => toggleColumn("purchases", c)}
        />
        <ColumnPicker
          label="What they like"
          optional
          hint="Only if you know it: favourite authors, artists, films or places. Split several with ; , or |."
          columns={parsed.columns.filter((c) => c !== mapping.email)}
          selected={mapping.taste}
          onToggle={(c) => toggleColumn("taste", c)}
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-semibold">Preview</h3>
          <span className="text-xs text-muted-foreground">
            {fmt.int(rows.length)} contacts
            {skipped > 0 && `, ${fmt.int(skipped)} without an email skipped`}
            {duplicates > 0 && `, ${fmt.int(duplicates)} repeats merged`}
          </span>
        </div>
        {over > 0 && (
          <Notice tone="warn">
            Only the first {fmt.int(MAX_CONTACT_ROWS)} contacts are imported; {fmt.int(over)} more are left out.
          </Notice>
        )}
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-3">Contact</TableHead>
                <TableHead>Where</TableHead>
                <TableHead>Bought, and likes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.map((p, i) => (
                <TableRow key={i}>
                  <TableCell className="pl-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={p.name || "?"} className="size-7" />
                      <div className="min-w-0">
                        <div className="max-w-40 truncate text-sm font-medium">{p.name || <span className="text-muted-foreground">No name</span>}</div>
                        <div className="max-w-40 truncate text-xs text-muted-foreground">{p.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{[p.where, p.age].filter(Boolean).join(", ") || "–"}</TableCell>
                  <TableCell>
                    <div className="flex max-w-64 flex-wrap gap-1">
                      {p.bought.slice(0, 3).map((t) => (
                        <Badge key={`b-${t}`} variant="outline" className="font-normal">
                          <ShoppingBag /> {t}
                        </Badge>
                      ))}
                      {p.tastes.slice(0, 3).map((t) => (
                        <Badge key={`t-${t}`} variant="secondary" className="font-normal">
                          {t}
                        </Badge>
                      ))}
                      {p.bought.length + p.tastes.length > 6 && <span className="text-xs text-muted-foreground">+{p.bought.length + p.tastes.length - 6}</span>}
                      {p.bought.length + p.tastes.length === 0 && <span className="text-xs text-muted-foreground">Nothing yet</span>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {preview.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">
                    No row has an email address in that column.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <FieldGroup label="How should they be kept?">
        <ChoiceCardGroup value={effectiveMode} onValueChange={setMode} className="sm:grid-cols-2" aria-label="How should they be kept?">
          <ChoiceCard
            value="groups"
            icon={<Boxes className="size-4" />}
            title="Taste groups"
            description={
              hasGroups
                ? "Each person joins the taste group that matches them best. Anyone who fits none starts a new group. Each group gets one email written for it."
                : "People with similar taste are grouped together. Each group gets one email written for its taste. Best for long lists."
            }
          />
          <ChoiceCard
            value="people"
            icon={<UsersRound className="size-4" />}
            title="Individual contacts"
            description={
              peopleAllowed
                ? "Each person gets their own taste profile. Tick them on a campaign and each gets a version written for them."
                : `Up to ${MAX_PEOPLE_LIST} people at a time. This file has ${fmt.int(rows.length)}.`
            }
            disabled={!peopleAllowed}
          />
        </ChoiceCardGroup>
      </FieldGroup>

      {effectiveMode === "groups" && !hasGroups && (
        <Field label="How many groups" optional className="sm:max-w-56">
          <Select value={k} onChange={(e) => setK(e.target.value)}>
            <option value="">Decide for me</option>
            {[2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n} groups
              </option>
            ))}
          </Select>
        </Field>
      )}

      <div className="sticky bottom-0 -mx-6 mt-auto flex items-center justify-between gap-4 border-t bg-popover px-6 py-4">
        <p className="text-xs text-muted-foreground">
          {error ? (
            <span className="text-destructive">{error}</span>
          ) : effectiveMode === "people" ? (
            "Qloo reads one person at a time, about 15 seconds each. They appear as it goes."
          ) : hasGroups ? (
            "Qloo reads everyone's tastes, then each person joins a group. About a minute."
          ) : (
            "Qloo reads everyone's tastes, then splits them into groups. About a minute."
          )}
        </p>
        <Button onClick={submit} disabled={!!busy || !mapping.email || rows.length === 0}>
          {busy && <Spinner data-icon="inline-start" />}
          {busy ?? (effectiveMode === "people" ? `Import ${peopleCountShort(rows.length)}` : "Import into taste groups")}
        </Button>
      </div>
    </>
  );
}

const peopleCountShort = (n: number) => (n === 1 ? "1 person" : `${fmt.int(n)} people`);

/**
 * Upload a contact CSV: map the columns (email required), check a preview,
 * choose taste groups or individual contacts, then import. Processing
 * continues on the server; Contacts shows its progress.
 */
export function ImportContactsSheet({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: (listId: Id<"emailLists">) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<"csv" | CrmId>("csv");
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

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setFile(null);
          setError(null);
          setSource("csv");
        }
      }}
    >
      <SheetContent className="w-full gap-0 overflow-x-hidden overflow-y-auto data-[side=right]:sm:max-w-2xl">
        <SheetHeader className="gap-1.5 border-b p-6">
          <SheetTitle>Import contacts</SheetTitle>
          <SheetDescription>
            Your customers with what they bought or booked, plus where they live and their age if you have it. Qloo reads each person&apos;s taste from it.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-6 px-6 pt-6 pb-6 has-[.sticky]:pb-0">
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Where the contacts come from">
            {[{ id: "csv" as const, name: "CSV file" }, ...CRMS].map((o) => (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={source === o.id}
                onClick={() => {
                  setSource(o.id);
                  setFile(null);
                  setError(null);
                }}
                className={cn(
                  "flex h-10 items-center justify-center gap-2 rounded-xl border text-sm transition-colors",
                  source === o.id ? "border-neutral-900 bg-neutral-900 text-white" : "bg-white hover:bg-muted",
                )}
              >
                {"logo" in o ? <o.logo className="size-4" /> : <FileSpreadsheet className="size-4" />}
                {o.name}
              </button>
            ))}
          </div>
          {source === "csv" ? (
            <>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
                e.target.value = "";
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
                "flex w-full items-center gap-4 rounded-2xl border border-dashed px-5 py-6 text-left transition-colors hover:bg-muted/50",
                file && "border-solid bg-muted/30 py-4",
              )}
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-black/[0.06]">
                {file ? <FileSpreadsheet className="size-5 text-neutral-700" /> : <UploadIcon className="size-5 text-neutral-700" />}
              </span>
              {file ? (
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{file.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {fmt.int(file.parsed.rows.length)} rows and {file.parsed.columns.length} columns. Click to replace
                  </span>
                </span>
              ) : (
                <span className="min-w-0">
                  <span className="block text-sm font-medium">Drop a CSV here or click to choose</span>
                  <span className="block text-xs text-muted-foreground">
                    Read in your browser; only the rows you confirm are uploaded. Up to {fmt.int(MAX_CONTACT_ROWS)} contacts.
                  </span>
                </span>
              )}
            </button>
            </>
          ) : (
            <CrmImport key={source} crm={source} onPulled={(parsed, label) => setFile({ name: label, parsed })} />
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {file && (
            <Mapper
              key={`${file.name}:${file.parsed.rows.length}`}
              parsed={file.parsed}
              filename={file.name}
              onDone={(id) => {
                onImported?.(id);
                onOpenChange(false);
                setFile(null);
              }}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

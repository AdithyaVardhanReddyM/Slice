"use client";

import { useAction, useMutation } from "convex/react";
import { Boxes, Check, FileSpreadsheet, Upload as UploadIcon, UsersRound } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import { MAX_CONTACT_ROWS, MAX_PEOPLE_LIST } from "@slice/backend/convex/emailTypes";
import { splitTerms } from "@slice/backend/convex/pagesCsv";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/format";
import { parseCsv, suggestMapping, type ParsedCsv } from "@/lib/pages/csv";
import { postJson } from "@/lib/pages/stream";
import { Field, Input, Select } from "@/components/console/form";
import { ChoiceCard, ChoiceCardGroup, FieldGroup, Notice, Spinner } from "@/components/console/setup/atoms";
import { errorText } from "@/lib/email/labels";
import { useEmailBrand } from "@/components/console/email/brand-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar } from "./shared";

// Convex caps a mutation's arguments; 500 rows of a contact CSV stay well under it.
const CHUNK = 500;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface EmailMapping {
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  taste: string[];
  city?: string;
  country?: string;
  age?: string;
  gender?: string;
}

type Role = Exclude<keyof EmailMapping, "taste" | "email">;

const ROLES: { key: Role; label: string }[] = [
  { key: "name", label: "Full name" },
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "city", label: "City" },
  { key: "country", label: "Country" },
  { key: "age", label: "Age" },
  { key: "gender", label: "Gender" },
];

/** The Pages guess (taste, place, age, gender) plus the columns email needs: the address and the name parts. */
export function suggestEmailMapping(columns: string[]): EmailMapping {
  const base = suggestMapping(columns);
  const pick = (re: RegExp) => columns.find((c) => re.test(c.trim()));
  const email = pick(/^e-?mail(_?address)?$/i) ?? pick(/e-?mail/i) ?? "";
  const firstName = pick(/^(first|given)[\s_-]?name$|^first$/i);
  const lastName = pick(/^(last|family)[\s_-]?name$|^surname$|^last$/i);
  // With first and last columns, a "name" guess is usually one of them.
  const name = pick(/^(full[\s_-]?)?name$/i) ?? (firstName ? undefined : base.name !== email ? base.name : undefined);
  const taken = new Set([email, name, firstName, lastName, base.city, base.country, base.age, base.gender].filter(Boolean));
  return {
    email,
    name,
    firstName,
    lastName,
    taste: base.taste.filter((c) => !taken.has(c)),
    city: base.city,
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
    where: [m.city && row[m.city], m.country && row[m.country]].filter(Boolean).join(", "),
    age: m.age ? row[m.age] : "",
    tastes: m.taste.flatMap((c) => splitTerms(row[c])),
  };
}

/** "newsletter-subscribers.csv" → "Newsletter subscribers". */
const listName = (filename: string) => {
  const base = filename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : "Contacts";
};

type Mode = "groups" | "people";

/** Mapping, preview, the cluster-or-not choice and the upload. Remount it (key) when the file changes. */
function Mapper({ parsed, filename, onDone }: { parsed: ParsedCsv; filename: string; onDone: (listId: Id<"emailLists">) => void }) {
  const brand = useEmailBrand();
  const create = useMutation(api.emailLists.create);
  const appendRows = useMutation(api.emailLists.appendRows);
  const process = useAction(api.emailLists.process);
  const rename = useMutation(api.emailAudiences.rename);
  const [mapping, setMapping] = useState<EmailMapping>(() => suggestEmailMapping(parsed.columns));
  const [name, setName] = useState(() => listName(filename));
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

  // A short list reads best one by one; anything past the limit has to be grouped.
  const [mode, setMode] = useState<Mode>(() => (parsed.rows.length <= MAX_PEOPLE_LIST ? "people" : "groups"));
  const peopleAllowed = rows.length <= MAX_PEOPLE_LIST;
  const effectiveMode: Mode = peopleAllowed ? mode : "groups";

  const preview = useMemo(() => rows.slice(0, 5).map((r) => readRow(r, mapping)), [rows, mapping]);
  const toggleTaste = (c: string) => setMapping((m) => ({ ...m, taste: m.taste.includes(c) ? m.taste.filter((x) => x !== c) : [...m.taste, c] }));
  const setRole = (key: Role | "email", col: string) =>
    setMapping((m) => ({ ...m, [key]: key === "email" ? col : col || undefined, taste: m.taste.filter((t) => t !== col) }));

  async function submit() {
    setBusy("Uploading contacts");
    setError(null);
    try {
      const { id: listId } = await create({
        brandId: brand._id,
        name: name.trim() || listName(filename),
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
      // The long part runs server-side and the list follows its own progress. Groups
      // come back named after their top entities; the agent then gives them human names.
      process({ id: listId, ...(effectiveMode === "groups" && k ? { k: Number(k) } : {}) })
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
        <FieldGroup
          label="Taste columns"
          hint="Favourite authors, books, artists, films, genres: anything people like. Cells can hold several, split by ; , or |."
          aside={`${mapping.taste.length} selected`}
        >
          <div className="flex flex-wrap gap-1.5">
            {parsed.columns
              .filter((c) => c !== mapping.email)
              .map((c) => {
                const on = mapping.taste.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleTaste(c)}
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
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-semibold">Preview</h3>
          <span className="text-xs text-muted-foreground">
            {fmt.int(rows.length)} contacts
            {skipped > 0 && ` · ${fmt.int(skipped)} without an email skipped`}
            {duplicates > 0 && ` · ${fmt.int(duplicates)} repeats merged`}
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
                <TableHead>Tastes</TableHead>
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
                  <TableCell className="text-xs text-muted-foreground">{[p.where, p.age].filter(Boolean).join(" · ") || "–"}</TableCell>
                  <TableCell>
                    <div className="flex max-w-64 flex-wrap gap-1">
                      {p.tastes.slice(0, 4).map((t) => (
                        <Badge key={t} variant="secondary" className="font-normal">
                          {t}
                        </Badge>
                      ))}
                      {p.tastes.length > 4 && <span className="text-xs text-muted-foreground">+{p.tastes.length - 4}</span>}
                      {p.tastes.length === 0 && <span className="text-xs text-muted-foreground">None</span>}
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

      <FieldGroup label="Cluster them into taste groups?">
        <ChoiceCardGroup value={effectiveMode} onValueChange={setMode} className="sm:grid-cols-2" aria-label="Cluster them into taste groups?">
          <ChoiceCard
            value="groups"
            icon={<Boxes className="size-4" />}
            title="Yes, into taste groups"
            description="People with similar taste are grouped into a few audiences. Each group gets one email written for its taste. Best for long lists."
          />
          <ChoiceCard
            value="people"
            icon={<UsersRound className="size-4" />}
            title="No, keep them one by one"
            description={
              peopleAllowed
                ? "Each person gets their own taste profile, and a campaign writes a version of the email for each of them."
                : `For lists of up to ${MAX_PEOPLE_LIST} people. This file has ${fmt.int(rows.length)}.`
            }
            disabled={!peopleAllowed}
          />
        </ChoiceCardGroup>
      </FieldGroup>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <Field label="List name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={listName(filename)} />
        </Field>
        {effectiveMode === "groups" && (
          <Field label="Taste groups" optional>
            <Select value={k} onChange={(e) => setK(e.target.value)}>
              <option value="">Automatic</option>
              {[2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n} groups
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>

      <div className="sticky bottom-0 -mx-6 mt-auto flex items-center justify-between gap-4 border-t bg-popover px-6 py-4">
        <p className="text-xs text-muted-foreground">
          {error ? (
            <span className="text-destructive">{error}</span>
          ) : effectiveMode === "people" ? (
            "Qloo reads one person at a time, about 15 seconds each. The list fills in as it goes."
          ) : (
            "Qloo reads everyone's tastes, then the list splits into groups. About a minute."
          )}
        </p>
        <Button onClick={submit} disabled={!!busy || !mapping.email || rows.length === 0}>
          {busy && <Spinner data-icon="inline-start" />}
          {busy ?? (effectiveMode === "people" ? `Import ${peopleCountShort(rows.length)}` : "Import and group")}
        </Button>
      </div>
    </>
  );
}

const peopleCountShort = (n: number) => (n === 1 ? "1 person" : `${fmt.int(n)} people`);

/**
 * Upload a contact CSV: map the columns (email required), check a preview,
 * choose taste groups or one by one, then import. Processing continues on the
 * server; the list shows its own progress.
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
        }
      }}
    >
      <SheetContent className="w-full gap-0 overflow-x-hidden overflow-y-auto data-[side=right]:sm:max-w-2xl">
        <SheetHeader className="gap-1.5 border-b p-6">
          <SheetTitle>Import contacts</SheetTitle>
          <SheetDescription>
            A CSV with an email column and, ideally, what people like. Qloo reads each person&apos;s taste so every email can follow it.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-6 px-6 pt-6 pb-6 has-[.sticky]:pb-0">
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
                  {fmt.int(file.parsed.rows.length)} rows · {file.parsed.columns.length} columns · click to replace
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

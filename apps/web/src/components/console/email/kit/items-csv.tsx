"use client";

import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { Check, FileUp } from "lucide-react";
import { api } from "@slice/backend/convex/_generated/api";
import { parseCsv, type ParsedCsv } from "@/lib/pages/csv";
import { ITEM_KINDS, errorText } from "@/lib/email/labels";
import type { EmailBrand, EmailItemRow } from "@/lib/email/types";
import { Select } from "@/components/console/form";
import { Notice, Spinner } from "@/components/console/setup/atoms";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Field = "name" | "subtitle" | "kind" | "description" | "price" | "image" | "url" | "tags";

const FIELDS: { key: Field; label: string; guess: RegExp }[] = [
  { key: "name", label: "Name", guess: /^(name|title|product|book|item)( name| title)?$/i },
  { key: "subtitle", label: "Author or subtitle", guess: /author|subtitle|brand|maker|vendor|artist|^by$/i },
  { key: "kind", label: "Kind", guess: /^(kind|type)$/i },
  { key: "description", label: "Description", guess: /desc|blurb|summary|about/i },
  { key: "price", label: "Price", guess: /price|cost|amount/i },
  { key: "image", label: "Picture", guess: /image|cover|photo|picture|img|thumbnail/i },
  { key: "url", label: "Link", guess: /url|link|href|page/i },
  { key: "tags", label: "Tags", guess: /tag|genre|categor|keyword|shelf/i },
];

const BATCH = 200;

function guessMapping(columns: string[]): Partial<Record<Field, string>> {
  const out: Partial<Record<Field, string>> = {};
  const used = new Set<string>();
  for (const f of FIELDS) {
    const col = columns.find((c) => !used.has(c) && f.guess.test(c.trim()));
    if (col) {
      out[f.key] = col;
      used.add(col);
    }
  }
  // No obvious name column: the first one is usually it.
  if (!out.name && columns[0] && !used.has(columns[0])) out.name = columns[0];
  return out;
}

const KINDS = new Set<string>(ITEM_KINDS.map((k) => k.value));

/** Catalog import: pick a CSV, check which column is which, add the rows. Names already in the catalog are skipped. */
export function ItemsCsvDialog({
  brand,
  items,
  open,
  onOpenChange,
  defaultKind,
}: {
  brand: EmailBrand;
  items: EmailItemRow[] | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultKind: string;
}) {
  const bulkCreate = useMutation(api.emailItems.bulkCreate);
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; csv: ParsedCsv } | null>(null);
  const [mapping, setMapping] = useState<Partial<Record<Field, string>>>({});
  const [kind, setKind] = useState(defaultKind);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ added: number; skipped: number } | null>(null);

  function reset() {
    setFile(null);
    setMapping({});
    setError(null);
    setDone(null);
  }

  async function read(f: File) {
    setError(null);
    try {
      const csv = parseCsv(await f.text());
      if (!csv.rows.length) throw new Error("That file has no rows under its header.");
      setFile({ name: f.name, csv });
      setMapping(guessMapping(csv.columns));
    } catch (err) {
      setError(String((err as Error).message ?? err));
    }
  }

  const rows = (file?.csv.rows ?? [])
    .map((r) => {
      const get = (k: Field) => (mapping[k] ? (r[mapping[k]!] ?? "").trim() : "");
      const rowKind = get("kind").toLowerCase();
      return {
        name: get("name"),
        kind: KINDS.has(rowKind) ? rowKind : kind,
        description: get("description"),
        tags: get("tags")
          .split(/[,;|]/)
          .map((t) => t.trim())
          .filter(Boolean),
        ...(get("subtitle") ? { subtitle: get("subtitle") } : {}),
        ...(get("price") ? { price: get("price") } : {}),
        ...(/^https?:\/\//i.test(get("image")) ? { image: get("image") } : {}),
        ...(/^https?:\/\//i.test(get("url")) ? { url: get("url") } : {}),
      };
    })
    .filter((r) => r.name);

  async function importRows() {
    setBusy(true);
    setError(null);
    try {
      const before = new Set((items ?? []).map((i) => i._id as string));
      const ids: string[] = [];
      for (let i = 0; i < rows.length; i += BATCH) {
        const out = await bulkCreate({ brandId: brand._id, items: rows.slice(i, i + BATCH) });
        ids.push(...out.filter((id): id is NonNullable<typeof id> => !!id));
      }
      const added = new Set(ids.filter((id) => !before.has(id))).size;
      setDone({ added, skipped: rows.length - added });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import items from a CSV</DialogTitle>
          <DialogDescription>One row per book, product or event. A name is enough; pictures, prices and links make better emails.</DialogDescription>
        </DialogHeader>

        <input
          ref={input}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void read(f);
          }}
        />

        {done ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <Check className="size-5" />
            </span>
            <p className="text-sm font-medium">
              Added {done.added} {done.added === 1 ? "item" : "items"}
            </p>
            {done.skipped > 0 && <p className="text-sm text-muted-foreground">{done.skipped} were already in the catalog and were left as they were.</p>}
            <p className="max-w-sm text-sm text-muted-foreground">Use “Match with Qloo” next, so taste picks can rank the new items for each reader.</p>
          </div>
        ) : !file ? (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-black/15 px-6 py-12 text-center transition-colors hover:border-black/30 hover:bg-neutral-50"
          >
            <FileUp className="size-6 text-muted-foreground" />
            <span className="text-sm font-medium">Choose a CSV file</span>
            <span className="text-xs text-muted-foreground">Columns like name, author, price, image, link, tags</span>
          </button>
        ) : (
          <div className="grid gap-5">
            <div className="flex items-center justify-between gap-3 rounded-xl bg-neutral-50 px-3 py-2 text-sm ring-1 ring-black/[0.05]">
              <span className="truncate">
                <span className="font-medium">{file.name}</span> ({file.csv.rows.length} rows)
              </span>
              <Button variant="ghost" size="sm" onClick={reset}>
                Choose another
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <label key={f.key} className="flex items-center justify-between gap-3 text-sm">
                  <span className="shrink-0 font-medium">{f.label}</span>
                  <Select className="w-44" value={mapping[f.key] ?? ""} onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value || undefined }))}>
                    <option value="">{f.key === "name" ? "Choose a column" : "Not in the file"}</option>
                    {file.csv.columns.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </label>
              ))}
              <label className="flex items-center justify-between gap-3 text-sm sm:col-span-2">
                <span className="min-w-0">
                  <span className="block font-medium">Kind of every row</span>
                  <span className="block text-xs text-muted-foreground">Used where the file has no kind column, or an unknown kind.</span>
                </span>
                <Select className="w-44" value={kind} onChange={(e) => setKind(e.target.value)}>
                  {ITEM_KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
            {rows.length > 0 && (
              <div>
                <p className="mb-2 text-xs text-muted-foreground">The first rows, as they will be added</p>
                <ul className="grid grid-cols-3 gap-3">
                  {rows.slice(0, 3).map((r, i) => (
                    <li key={i} className="min-w-0">
                      <span className="block aspect-[4/5] overflow-hidden rounded-lg bg-neutral-100 ring-1 ring-black/[0.06]">
                        {r.image && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.image} alt="" className="size-full object-cover" />
                        )}
                      </span>
                      <span className="mt-1.5 block truncate text-xs font-medium">{r.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{[r.subtitle, r.price].filter(Boolean).join(", ") || r.kind}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {error && <Notice tone="bad">{error}</Notice>}

        <DialogFooter>
          {done ? (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={importRows} disabled={!file || !mapping.name || rows.length === 0 || busy}>
                {busy && <Spinner data-icon="inline-start" />}
                Import {rows.length || ""} {rows.length === 1 ? "item" : "items"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

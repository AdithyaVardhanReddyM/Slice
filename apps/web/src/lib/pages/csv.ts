// Client-side CSV parsing for the Audiences upload flow. The column-mapping
// heuristics come from the backend's pure helper (`pagesCsv.suggestMapping`)
// so the mapping UI opens prefilled exactly as the server would guess it.
// Handles quoted fields, embedded newlines and escaped quotes; comma,
// semicolon and tab delimiters are detected from the header line.

export { suggestMapping, type CsvMapping } from "@slice/backend/convex/pagesCsv";

export interface ParsedCsv {
  columns: string[];
  rows: Record<string, string>[];
  delimiter: string;
}

function detectDelimiter(header: string) {
  const counts: [string, number][] = [",", ";", "\t"].map((d) => [d, header.split(d).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

/** Parses a CSV string into rows keyed by header. Empty lines are skipped. */
export function parseCsv(text: string): ParsedCsv {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = detectDelimiter(firstLine);
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === delimiter) {
      record.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      record.push(field);
      field = "";
      if (record.some((v) => v.trim() !== "")) records.push(record);
      record = [];
    } else field += c;
  }
  if (field !== "" || record.length) {
    record.push(field);
    if (record.some((v) => v.trim() !== "")) records.push(record);
  }
  if (records.length === 0) return { columns: [], rows: [], delimiter };
  const columns = records[0].map((c, i) => (c.trim() || `column_${i + 1}`));
  const rows = records.slice(1).map((r) => {
    const row: Record<string, string> = {};
    columns.forEach((col, i) => {
      row[col] = (r[i] ?? "").trim();
    });
    return row;
  });
  return { columns, rows, delimiter };
}

/** Serialises rows back to CSV (for the form-submission export). */
export function toCsv(columns: string[], rows: Record<string, string | number | undefined>[]) {
  const esc = (v: string | number | undefined) => {
    const s = v === undefined || v === null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map(esc).join(","), ...rows.map((r) => columns.map((c) => esc(r[c])).join(","))].join("\n");
}

export function downloadText(filename: string, text: string, type = "text/csv") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

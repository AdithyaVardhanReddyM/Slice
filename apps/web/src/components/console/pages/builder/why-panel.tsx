"use client";

import { Lightbulb } from "lucide-react";
import type { Section, Variant } from "@/lib/pages/types";
import { docOf, isHtmlDoc } from "@/lib/pages/types";
import { Badge } from "@/components/ui/badge";
import { Hint, TraceList } from "../shared";

function sectionTitle(s: Section) {
  switch (s.type) {
    case "hero":
    case "split":
    case "story":
    case "offer":
    case "culture":
    case "form":
    case "cta":
      return s.headline;
    case "grid":
    case "gallery":
    case "testimonials":
    case "faq":
    case "locations":
      return s.headline ?? "";
    case "stats":
      return s.items.map((i) => i.label).join(" · ");
    case "custom":
      return "Custom HTML";
  }
}

/** Sections of the active version with the Qloo evidence each one cites, plus the build trace. */
export function WhyPanel({ variant, onPick }: { variant: Variant | null; onPick?: (sectionId: string) => void }) {
  const doc = docOf(variant);
  if (!variant) return <Hint>Pick a version.</Hint>;
  if (!doc) return <Hint>Build this version to see what shaped each section.</Hint>;
  const rows: { id: string; title: string; tag: string; evidence?: string }[] = isHtmlDoc(doc)
    ? doc.sections.map((s) => ({ id: s.id, title: s.label || s.id, tag: s.id, evidence: s.evidence }))
    : doc.sections.map((s) => ({ id: s.id, title: sectionTitle(s) || s.id, tag: s.type, evidence: s.evidence }));
  return (
    <div className="space-y-5 text-sm">
      <div className="flex items-start gap-2 rounded-lg bg-muted/60 p-3">
        <Lightbulb className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="text-muted-foreground">
          Each section notes the audience&apos;s tastes it was written around. Click one to jump to it in the preview.
        </p>
      </div>
      <ol className="space-y-3">
        {rows.map((s, i) => (
          <li key={s.id}>
            <button type="button" onClick={() => onPick?.(s.id)} className="w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/50">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="num text-xs text-muted-foreground">{i + 1}</span>
                  <span className="truncate font-medium">{s.title}</span>
                </span>
                <Badge variant="outline">{s.tag}</Badge>
              </div>
              <p className={s.evidence ? "mt-1.5 text-muted-foreground" : "mt-1.5 text-xs text-muted-foreground"}>
                {s.evidence ?? "No notes for this section."}
              </p>
            </button>
          </li>
        ))}
      </ol>
      {variant.trace.length > 0 && (
        <div className="space-y-2 border-t pt-4">
          <h3 className="text-sm font-medium">How it was built</h3>
          <TraceList spans={variant.trace} compact />
        </div>
      )}
    </div>
  );
}
